import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException
} from '@nestjs/common'
import { EnumOrderStatus } from '@prisma/client'
import { DeliveryService } from 'src/delivery/delivery.service'
import { LoyaltyLevelService } from 'src/loyalty-level/loyalty-level.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { RetailCRMSyncService } from 'src/retailcrm-sync/retailcrm-sync.service'
import { RobokassaService } from 'src/robokassa/robokassa.service'
import {
	getOrderStatusIcons,
	getOrderStatusTranslation
} from 'src/utils/translate-status'
import { returnUserObject } from './../user/return-user.object'
import { WooSyncService } from 'src/woo-sync/woo-sync.service'
import { OrderDto, UpdateOrderDto } from './dto/order.dto'
import {
	calculateBirthdayDiscount,
	getApplicableDiscount
} from './order-discount.utils'
import { AuditService } from 'src/audit/audit.service'
import {
	buildOrderData,
	buildReceiptItems,
	calculateTotal,
	normalizeReceiptPhone
} from './order-helpers'

@Injectable()
export class OrderService {
	private readonly logger = new Logger(OrderService.name)

	constructor(
		private prisma: PrismaService,
		private notifications: NotificationsService,
		private robokassa: RobokassaService,
		private wooSync: WooSyncService,
		private retailCRM: RetailCRMSyncService,
		private loyaltyLevel: LoyaltyLevelService,
		private delivery: DeliveryService,
		private audit: AuditService
	) {}

	async getById(id: string) {
		return this.prisma.order.findUnique({
			where: { id },
			include: {
				user: { select: { ...returnUserObject } },
				address: true,
				items: true
			}
		})
	}

	async getAll() {
		return this.prisma.order.findMany({
			orderBy: { createdAt: 'desc' },
			include: {
				user: { select: { ...returnUserObject } },
				address: true,
				items: true
			}
		})
	}

	async getByUserId(userId: string, page = 1, perPage = 10) {
		const skip = (page - 1) * perPage
		const [orders, total] = await Promise.all([
			this.prisma.order.findMany({
				where: { userId },
				orderBy: { createdAt: 'desc' },
				skip,
				take: perPage,
				include: {
					user: { select: { ...returnUserObject } },
					address: true,
					items: true
				}
			}),
			this.prisma.order.count({ where: { userId } })
		])
		return { orders, total, hasMore: skip + orders.length < total }
	}

	async getActiveOrdersSummary(userId: string) {
		const ACTIVE_STATUSES: EnumOrderStatus[] = [
			'pending',
			'payed',
			'shipped',
			'ready_to_receive'
		]
		const where = { userId, status: { in: ACTIVE_STATUSES } }

		const count = await this.prisma.order.count({ where })
		if (count !== 1) return { count, order: null }

		const order = await this.prisma.order.findFirst({
			where,
			include: {
				user: { select: { ...returnUserObject } },
				address: true,
				items: true
			}
		})
		return { count, order }
	}

	async getPopularProductIds(days = 30, minPrice = 1000, take = 8) {
		const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
		const items = await this.prisma.orderItem.groupBy({
			by: ['productId'],
			where: {
				productId: { not: null },
				price: { gte: minPrice },
				order: {
					status: { not: 'cancelled' },
					createdAt: { gte: since }
				}
			},
			_sum: { quantity: true },
			orderBy: { _sum: { quantity: 'desc' } },
			take
		})
		return items.map(i => i.productId).filter(Boolean) as string[]
	}

	async createPayment(dto: OrderDto, userId: string) {
		const [userLoyalty, user, previousOrdersCount] = await Promise.all([
			this.prisma.userLoyalty.findUnique({ where: { userId } }),
			this.prisma.user.findUnique({
				where: { id: userId },
				select: {
					dateOfBirth: true,
					name: true,
					surname: true,
					phone: true,
					email: true
				}
			}),
			this.prisma.order.count({ where: { userId } })
		])

		const welcomeDiscount = previousOrdersCount === 0 ? 20 : 0
		const discount = getApplicableDiscount(
			userLoyalty?.currentDiscount ?? 0,
			calculateBirthdayDiscount(user.dateOfBirth),
			welcomeDiscount
		)
		const couponData = dto.coupon
			? await this.wooSync.validateCoupon(dto.coupon)
			: null
		const totalPrice = calculateTotal(
			dto.items,
			discount,
			couponData,
			dto.deliveryPrice
		)
		const invoiceId = this.robokassa.generateInvoiceId()

		const order = await this.prisma.order.create({
			include: { user: true },
			data: buildOrderData(dto, userId, discount, invoiceId, totalPrice)
		})

		const address = dto.addressId
			? await this.prisma.address.findUnique({ where: { id: dto.addressId } })
			: null

		this.wooSync
			.createOrderInWooCommerce(user.email, order, address, dto.items, user)
			.then(wcOrderId => {
				if (wcOrderId) {
					this.prisma.order
						.update({ where: { id: order.id }, data: { wcOrderId } })
						.catch(() => null)
					this.retailCRM
						.createOrder(order, user, dto.items, wcOrderId)
						.catch(() => null)
				}
			})
			.catch(() => null)

		if (dto.deliveryMethod === 'sdec' && address) {
			const recipientName =
				dto.recipientDetails === 'other_recipient'
					? [dto.recipientName, dto.recipientSurname].filter(Boolean).join(' ')
					: [user.name, user.surname].filter(Boolean).join(' ')
			const recipientPhone =
				dto.recipientDetails === 'other_recipient'
					? dto.recipientPhone
					: user.phone

			if (address.postCode && recipientName && recipientPhone) {
				const streetAddress = [address.street, address.house, address.apartment]
					.filter(Boolean)
					.join(', ')

				this.delivery
					.createCdekShipment({
						orderNumber: order.id.slice(0, 6).toUpperCase(),
						toPostCode: address.postCode,
						toCity: address.city,
						toAddress: streetAddress,
						recipientName,
						recipientPhone,
						orderTotal: totalPrice,
						items: dto.items.map(i => ({
							name: i.productName || 'Косметика',
							quantity: i.quantity,
							price: i.price
						}))
					})
					.then(result => {
						if (!result) return
						const data: any = { cdekUuid: result.uuid }
						if (result.trackingNumber)
							data.trackingNumber = result.trackingNumber
						this.prisma.order
							.update({ where: { id: order.id }, data })
							.catch(() => null)
						if (!result.trackingNumber)
							this.quickPollCdekTracking(order.id, result.uuid)
					})
					.catch(() => null)
			}
		}

		if (dto.deliveryMethod === 'russian_post' && address) {
			const recipientName =
				dto.recipientDetails === 'other_recipient'
					? dto.recipientName || user.name
					: user.name
			const recipientSurname =
				dto.recipientDetails === 'other_recipient'
					? dto.recipientSurname || user.surname
					: user.surname
			const recipientPhone =
				dto.recipientDetails === 'other_recipient'
					? dto.recipientPhone
					: user.phone

			if (address.postCode && recipientName && recipientPhone) {
				this.delivery
					.createRussianPostShipment({
						orderNumber: order.id.slice(0, 6).toUpperCase(),
						toPostCode: address.postCode,
						toCity: address.city,
						toRegion: address.region || address.city,
						toStreet: address.street,
						toHouse: address.house,
						toApartment: address.apartment,
						recipientName,
						recipientSurname,
						recipientPhone,
						orderTotal: totalPrice,
						items: dto.items.map(i => ({
							name: i.productName || 'Косметика',
							quantity: i.quantity,
							price: i.price
						}))
					})
					.then(result => {
						if (!result) return
						const data: any = { russianPostId: String(result.id) }
						if (result.barcode) data.trackingNumber = result.barcode
						this.prisma.order
							.update({ where: { id: order.id }, data })
							.catch(() => null)
					})
					.catch(() => null)
			}
		}

		setTimeout(
			() =>
				this.notifications.sendPushNotificationToAdmins(
					'🛍️ Новый заказ (приложение)',
					`Заказ #${order.id.slice(0, 6).toUpperCase()} — ожидает оплаты`,
					{ orderId: order.id, isRead: true }
				),
			2000
		)

		const receiptItems = buildReceiptItems(
			dto.items.map(i => ({
				name: `${i.productName || 'Товар'}${
					i.variationLabel ? ` (${i.variationLabel})` : ''
				}`,
				quantity: i.quantity,
				price: i.price
			})),
			dto.deliveryPrice || 0,
			totalPrice
		)
		const paymentUrl = this.robokassa.generatePaymentUrl(
			invoiceId,
			totalPrice,
			`Заказ #${order.id.slice(0, 6).toUpperCase()}`,
			receiptItems,
			dto.podeli ? 'Podeli' : undefined,
			user.email,
			normalizeReceiptPhone(user.phone)
		)
		return { confirmation: { confirmation_url: paymentUrl }, orderId: order.id }
	}

	async payOrder(orderId: string) {
		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: {
				totalPrice: true,
				invoiceId: true,
				podeli: true,
				deliveryPrice: true,
				items: true,
				user: { select: { email: true, phone: true } }
			}
		})
		if (!order) throw new NotFoundException('Заказ не найден')

		let invoiceId = order.invoiceId
		if (!invoiceId) {
			invoiceId = this.robokassa.generateInvoiceId()
			await this.prisma.order.update({
				where: { id: orderId },
				data: { invoiceId }
			})
		}

		const receiptItems = buildReceiptItems(
			order.items.map(i => ({
				name: `${i.productName || 'Товар'}${
					(i as any).variationLabel ? ` (${(i as any).variationLabel})` : ''
				}`,
				quantity: i.quantity,
				price: i.price
			})),
			order.deliveryPrice || 0,
			order.totalPrice
		)
		const paymentUrl = this.robokassa.generatePaymentUrl(
			invoiceId,
			order.totalPrice,
			`Заказ #${orderId.slice(0, 6).toUpperCase()}`,
			receiptItems,
			order.podeli ? 'Podeli' : undefined,
			order.user?.email,
			normalizeReceiptPhone(order.user?.phone)
		)
		return { confirmation: { confirmation_url: paymentUrl } }
	}

	async update(id: string, dto: UpdateOrderDto, actorId?: string) {
		const order = await this.getById(id)
		if (!order) throw new NotFoundException('Заказ не найден')

		const updated = await this.prisma.order.update({
			where: { id },
			include: { user: true },
			data: { status: dto.status }
		})

		this.audit
			.log({
				action: 'order.status',
				entity: 'Order',
				entityId: id,
				entityName: `#${id.slice(0, 6).toUpperCase()}`,
				actorId,
				before: { status: order.status },
				after: { status: dto.status },
				revertible: false
			})
			.catch(() => null)

		this.wooSync.updateOrderStatus(id, dto.status).catch(() => null)
		this.retailCRM.updateOrderStatus(id, dto.status).catch(() => null)

		if (
			dto.status === 'delivered' &&
			order.status !== 'delivered' &&
			updated.userId
		) {
			const amountToAdd = order.totalPrice - (order.deliveryPrice || 0)
			this.loyaltyLevel
				.addAmountAndUpdateLevel(updated.userId, amountToAdd, {
					orderId: id,
					reason: `Заказ #${id.slice(0, 6).toUpperCase()} доставлен`
				})
				.then(async () => {
					const loyalty = await this.prisma.userLoyalty.findUnique({
						where: { userId: updated.userId },
						select: { currentDiscount: true }
					})
					if (loyalty?.currentDiscount && updated.user?.email) {
						this.wooSync
							.updateCustomerDiscount(
								updated.user.email,
								loyalty.currentDiscount
							)
							.catch(() => null)
					}
				})
				.catch(() => null)
		} else if (
			order.status === 'delivered' &&
			dto.status !== 'delivered' &&
			updated.userId
		) {
			// Ранее доставленный заказ переведён в другой статус (отмена/возврат) —
			// откатываем начисленную за него сумму лояльности
			const amountToSubtract = order.totalPrice - (order.deliveryPrice || 0)
			this.loyaltyLevel
				.subtractAmountAndUpdateLevel(updated.userId, amountToSubtract, {
					orderId: id,
					reason: `Отмена заказа #${id.slice(0, 6).toUpperCase()}`
				})
				.then(async () => {
					const loyalty = await this.prisma.userLoyalty.findUnique({
						where: { userId: updated.userId },
						select: { currentDiscount: true }
					})
					if (updated.user?.email) {
						this.wooSync
							.updateCustomerDiscount(
								updated.user.email,
								loyalty?.currentDiscount ?? 0
							)
							.catch(() => null)
					}
				})
				.catch(() => null)
		}

		const deliveryMethod = order?.deliveryMethod as string | null
		setTimeout(async () => {
			const notification = await this.notifications.saveNotification(
				updated.user.id,
				getOrderStatusIcons(dto.status, deliveryMethod),
				`Заказ #${updated.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(
					dto.status,
					deliveryMethod
				)}`,
				{ orderUserId: updated.id, status: updated.status }
			)
			await this.notifications.sendPushNotificationToUser(
				updated.userId,
				getOrderStatusIcons(dto.status, deliveryMethod),
				`Заказ #${updated.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(
					dto.status,
					deliveryMethod
				)}`,
				{
					orderUserId: updated.id,
					status: updated.status,
					notification: notification.id
				},
				'orders'
			)
		}, 2000)
	}

	async cancelOrder(id: string, userId: string, reason?: string) {
		const order = await this.getById(id)
		if (!order) throw new NotFoundException('Заказ не найден')
		if (order.userId !== userId)
			throw new ForbiddenException('Нет доступа к этому заказу')

		if (!['pending', 'payed'].includes(order.status))
			throw new BadRequestException('Заказ в текущем статусе нельзя отменить')

		if (order.status === 'payed') {
			const hours = (Date.now() - new Date(order.createdAt).getTime()) / 3600000
			if (hours > 1)
				throw new BadRequestException(
					'Время для отмены оплаченного заказа истекло (1 час)'
				)
		}

		const cancelled = await this.prisma.order.update({
			where: { id },
			include: { user: true },
			data: { status: 'cancelled', cancelReason: reason ?? null }
		})

		this.wooSync.updateOrderStatus(id, 'cancelled').catch(() => null)
		this.retailCRM.updateOrderStatus(id, 'cancelled').catch(() => null)
		if ((order as any).cdekUuid) {
			this.delivery.cancelCdekOrder((order as any).cdekUuid).catch(() => null)
		}
		if ((order as any).russianPostId) {
			this.delivery
				.cancelRussianPostOrder(Number((order as any).russianPostId))
				.catch(() => null)
		}

		let refundSucceeded = false
		if (order.status === 'payed' && (order as any).invoiceId) {
			try {
				refundSucceeded = await this.robokassa.refundByInvoiceId(
					(order as any).invoiceId,
					order.totalPrice
				)
				this.logger.log(
					`Refund for order ${id} (invId=${(order as any).invoiceId}): ${
						refundSucceeded ? 'succeeded' : 'failed'
					}`
				)
			} catch (e) {
				this.logger.error(`Refund for order ${id} threw: ${e}`)
			}
		}

		// Лояльность начисляется только при статусе delivered, а отменить можно
		// только pending/payed заказ — значит списывать здесь нечего

		setTimeout(async () => {
			const notification = await this.notifications.saveNotification(
				userId,
				'❌ Заказ отменён',
				`Заказ #${id.slice(0, 6).toUpperCase()} был отменён по вашему запросу.`,
				{ orderUserId: id, status: 'cancelled' }
			)
			await this.notifications.sendPushNotificationToUser(
				userId,
				'❌ Заказ отменён',
				`Заказ #${id.slice(0, 6).toUpperCase()} был отменён по вашему запросу.`,
				{ orderUserId: id, status: 'cancelled', notification: notification.id },
				'orders'
			)
		}, 1000)

		this.notifications
			.sendPushNotificationToAdmins(
				'❌ Заказ отменён клиентом',
				`Заказ #${id.slice(0, 6).toUpperCase()} отменён пользователем${
					reason ? `. Причина: ${reason}` : ''
				}`,
				{ orderId: id, isRead: true }
			)
			.catch(() => null)

		return cancelled
	}

	async delete(id: string) {
		const order = await this.getById(id)
		if (!order) throw new NotFoundException('Заказ не найден')
		return this.prisma.order.delete({ where: { id } })
	}

	private quickPollCdekTracking(orderId: string, cdekUuid: string) {
		const tryFetch = async () => {
			const tn = await this.delivery
				.getCdekTrackingNumber(cdekUuid)
				.catch(() => null)
			if (!tn) return false
			await this.prisma.order
				.update({ where: { id: orderId }, data: { trackingNumber: tn } })
				.catch(() => null)
			return true
		}

		const delays = [15_000, 45_000, 90_000]
		let resolved = false
		for (const delay of delays) {
			setTimeout(async () => {
				if (resolved) return
				resolved = await tryFetch()
			}, delay)
		}
	}

	markAsPaid(orderId: string) {
		this.wooSync.updateOrderStatus(orderId, 'payed').catch(() => null)
		this.retailCRM.updateOrderStatus(orderId, 'payed').catch(() => null)
		this.notifications
			.sendPushNotificationToAdmins(
				'💳 Заказ оплачен (приложение)',
				`Заказ #${orderId.slice(0, 6).toUpperCase()} оплачен через приложение`,
				{ orderId, isRead: true }
			)
			.catch(() => null)
	}
}
