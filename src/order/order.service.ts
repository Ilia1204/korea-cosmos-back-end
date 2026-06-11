import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
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

@Injectable()
export class OrderService {
	constructor(
		private prisma: PrismaService,
		private notifications: NotificationsService,
		private robokassa: RobokassaService,
		private wooSync: WooSyncService,
		private retailCRM: RetailCRMSyncService,
		private loyaltyLevel: LoyaltyLevelService
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

	async getByUserId(userId: string) {
		return this.prisma.order.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			include: {
				user: { select: { ...returnUserObject } },
				address: true,
				items: true
			}
		})
	}

	async createPayment(dto: OrderDto, userId: string) {
		const [userLoyalty, user] = await Promise.all([
			this.prisma.userLoyalty.findUnique({ where: { userId } }),
			this.prisma.user.findUnique({
				where: { id: userId },
				select: { dateOfBirth: true, name: true, surname: true, phone: true, email: true }
			})
		])

		const discount = getApplicableDiscount(
			userLoyalty?.currentDiscount ?? 0,
			calculateBirthdayDiscount(user.dateOfBirth)
		)
		const couponData = dto.coupon ? await this.wooSync.validateCoupon(dto.coupon) : null
		const totalPrice = this.calculateTotal(dto.items, discount, couponData, dto.deliveryPrice)
		const invoiceId = this.robokassa.generateInvoiceId()

		const order = await this.prisma.order.create({
			include: { user: true },
			data: this.buildOrderData(dto, userId, discount, invoiceId, totalPrice)
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
					// Create in RetailCRM with WC order ID as externalId to prevent auto-sync duplicates
					this.retailCRM.createOrder(order, user, dto.items, wcOrderId).catch(() => null)
				}
			})
			.catch(() => null)

		setTimeout(() =>
			this.notifications.sendPushNotificationToAdmins(
				'🛍️ Новый заказ (приложение)',
				`Заказ #${order.id.slice(0, 6).toUpperCase()} — ожидает оплаты`,
				{ orderId: order.id, isRead: true }
			), 2000)

		const paymentUrl = this.robokassa.generatePaymentUrl(
			invoiceId, totalPrice,
			`Заказ #${order.id.slice(0, 6).toUpperCase()}`,
			dto.podeli ? 'Podeli' : undefined
		)
		return { confirmation: { confirmation_url: paymentUrl }, orderId: order.id }
	}

	private calculateTotal(
		items: OrderDto['items'],
		discount: number,
		couponData: any,
		deliveryPrice = 0
	): number {
		const subtotal = items.reduce((acc, item) => {
			const original = item.originalPrice || item.price
			const saleDiscount =
				original > item.price ? ((original - item.price) / original) * 100 : 0
			const effective = Math.max(discount, saleDiscount)
			return acc + original * (1 - effective / 100) * item.quantity
		}, 0)

		let afterCoupon = subtotal
		if (couponData?.valid) {
			afterCoupon =
				couponData.discountType === 'percent'
					? subtotal * (1 - couponData.amount / 100)
					: Math.max(0, subtotal - couponData.amount)
		}
		return afterCoupon + deliveryPrice
	}

	private buildOrderData(
		dto: OrderDto,
		userId: string,
		discount: number,
		invoiceId: number,
		totalPrice: number
	) {
		return {
			status: dto.status,
			deliveryMethod: dto.deliveryMethod,
			deliveryPrice: dto.deliveryPrice,
			coupon: dto.coupon,
			comment: dto.comment,
			recipientDetails: dto.recipientDetails,
			recipientName: dto.recipientName,
			recipientSurname: dto.recipientSurname,
			recipientPhone: dto.recipientPhone,
			recipientEmail: dto.recipientEmail,
			discountApplied: discount,
			invoiceId,
			totalPrice,
			items: {
				create: dto.items.map(item => ({
					quantity: item.quantity,
					price: item.price,
					productId: item.productId,
					productName: item.productName || null,
					productImage: item.productImage || null
				}))
			},
			...(dto.addressId && { address: { connect: { id: dto.addressId } } }),
			user: { connect: { id: userId } }
		}
	}

	async payOrder(orderId: string) {
		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: { totalPrice: true, invoiceId: true }
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

		const paymentUrl = this.robokassa.generatePaymentUrl(
			invoiceId,
			order.totalPrice,
			`Заказ #${orderId.slice(0, 6).toUpperCase()}`
		)
		return { confirmation: { confirmation_url: paymentUrl } }
	}

	async update(id: string, dto: UpdateOrderDto) {
		const order = await this.getById(id)
		if (!order) throw new NotFoundException('Заказ не найден')

		const updated = await this.prisma.order.update({
			where: { id },
			include: { user: true },
			data: { status: dto.status }
		})

		this.wooSync.updateOrderStatus(id, dto.status).catch(() => null)
		this.retailCRM.updateOrderStatus(id, dto.status).catch(() => null)

		if (dto.status === 'delivered' && updated.userId) {
			const amountToAdd = order.totalPrice - (order.deliveryPrice || 0)
			this.loyaltyLevel
				.addAmountAndUpdateLevel(updated.userId, amountToAdd)
				.then(async () => {
					const loyalty = await this.prisma.userLoyalty.findUnique({
						where: { userId: updated.userId },
						select: { currentDiscount: true }
					})
					if (loyalty?.currentDiscount && updated.user?.email) {
						this.wooSync
							.updateCustomerDiscount(updated.user.email, loyalty.currentDiscount)
							.catch(() => null)
					}
				})
				.catch(() => null)
		}

		setTimeout(async () => {
			const notification = await this.notifications.saveNotification(
				updated.user.id,
				getOrderStatusIcons(dto.status),
				`Заказ #${updated.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(dto.status)}`,
				{ orderUserId: updated.id, status: updated.status }
			)
			await this.notifications.sendPushNotificationToUser(
				updated.userId,
				getOrderStatusIcons(dto.status),
				`Заказ #${updated.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(dto.status)}`,
				{
					orderUserId: updated.id,
					status: updated.status,
					notification: notification.id
				}
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
				{ orderUserId: id, status: 'cancelled', notification: notification.id }
			)
		}, 1000)

		return cancelled
	}

	async delete(id: string) {
		const order = await this.getById(id)
		if (!order) throw new NotFoundException('Заказ не найден')
		return this.prisma.order.delete({ where: { id } })
	}

	markAsPaid(orderId: string) {
		this.wooSync.updateOrderStatus(orderId, 'payed').catch(() => null)
		this.retailCRM.updateOrderStatus(orderId, 'payed').catch(() => null)
		this.notifications.sendPushNotificationToAdmins(
			'💳 Заказ оплачен (приложение)',
			`Заказ #${orderId.slice(0, 6).toUpperCase()} оплачен через приложение`,
			{ orderId, isRead: true }
		).catch(() => null)
	}

	validateWooCoupon(code: string) {
		return this.wooSync.validateCoupon(code)
	}

	getWooCommerceOrders(email: string) {
		return this.wooSync.getOrders(email)
	}

	getWooCommerceOrderById(wcId: string) {
		return this.wooSync.getOrderById(wcId)
	}

	async updateWooCommerceOrderStatus(wcId: number, status: string) {
		await this.wooSync.updateWooOrderById(wcId, status)
		return { success: true }
	}
}
