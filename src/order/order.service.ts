import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { returnUserObject } from './../user/return-user.object'
import { OrderDto, UpdateOrderDto } from './dto/order.dto'

import { NotificationsService } from 'src/notifications/notifications.service'
import { RobokassaService } from 'src/robokassa/robokassa.service'
import {
	getOrderStatusIcons,
	getOrderStatusTranslation
} from 'src/utils/translate-status'

@Injectable()
export class OrderService {
	private wooOrdersCache = new Map<string, { data: any[]; ts: number }>()
	private readonly WOO_CACHE_TTL = 3 * 60 * 1000

	constructor(
		private prisma: PrismaService,
		private notificationService: NotificationsService,
		private robokassa: RobokassaService
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

	async createPayment(dto: OrderDto, userId: string) {
		const userLoyalty = await this.prisma.userLoyalty.findUnique({
			where: { userId }
		})

		const discount = userLoyalty ? userLoyalty.currentDiscount : 0

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: {
				dateOfBirth: true,
				name: true,
				surname: true,
				phone: true,
				email: true
			}
		})

		const birthdayDiscount = this.calculateBirthdayDiscount(user.dateOfBirth)
		const applicableDiscount = this.getApplicableDiscount(
			discount,
			birthdayDiscount
		)

		const couponData = dto.coupon
			? await this.validateWooCoupon(dto.coupon)
			: null

		const totalPriceWithDiscount = dto.items.reduce((acc, item) => {
			const originalPrice = item.originalPrice || item.price
			const saleDiscount =
				originalPrice > item.price
					? ((originalPrice - item.price) / originalPrice) * 100
					: 0
			const effectiveDiscount = Math.max(applicableDiscount, saleDiscount)
			const finalPrice = originalPrice * (1 - effectiveDiscount / 100)
			return acc + finalPrice * item.quantity
		}, 0)

		let totalAfterCoupon = totalPriceWithDiscount
		if (couponData?.valid) {
			if (couponData.discountType === 'percent') {
				totalAfterCoupon =
					totalPriceWithDiscount * (1 - couponData.amount / 100)
			} else {
				totalAfterCoupon = Math.max(
					0,
					totalPriceWithDiscount - couponData.amount
				)
			}
		}

		const totalPriceWithDelivery =
			totalAfterCoupon + (dto.deliveryPrice || 0)

		const invoiceId = this.robokassa.generateInvoiceId()

		const order = await this.prisma.order.create({
			include: { user: true },
			data: {
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
				discountApplied: applicableDiscount,
				invoiceId,
				items: {
					create: dto.items.map(item => ({
						quantity: item.quantity,
						price: item.price,
						productId: item.productId,
						productName: item.productName || null,
						productImage: item.productImage || null
					}))
				},
				...(dto.addressId && {
					address: { connect: { id: dto.addressId } }
				}),
				totalPrice: totalPriceWithDelivery,
				user: { connect: { id: userId } }
			}
		})

		await this.sendToRetailCRM(order, user, dto.items)

		setTimeout(async () => {
			await this.notificationService.sendPushNotificationToAdmins(
				'🛍️ Новый заказ',
				`Новый заказ #${order.id.slice(0, 6).toUpperCase()} ожидает обработки`,
				{ orderId: order.id, isRead: true }
			)
		}, 2000)

		const paymentUrl = this.robokassa.generatePaymentUrl(
			invoiceId,
			totalPriceWithDelivery,
			`Заказ #${order.id.slice(0, 6).toUpperCase()}`,
			dto.podeli ? 'Podeli' : undefined
		)

		return { confirmation: { confirmation_url: paymentUrl }, orderId: order.id }
	}

	async validateWooCoupon(code: string) {
		try {
			const wcAuth = Buffer.from(
				`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
			).toString('base64')
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/coupons?code=${encodeURIComponent(code)}`,
				{ headers: { Authorization: `Basic ${wcAuth}` } }
			)
			const data = await res.json()
			const coupon = data?.[0]
			if (!coupon) return { valid: false, message: 'Промокод не найден' }
			if (!coupon.status || coupon.status !== 'publish')
				return { valid: false, message: 'Промокод неактивен' }
			if (coupon.date_expires && new Date(coupon.date_expires) < new Date())
				return { valid: false, message: 'Срок действия промокода истёк' }
			if (
				coupon.usage_limit &&
				coupon.usage_count >= coupon.usage_limit
			)
				return { valid: false, message: 'Промокод уже использован' }

			return {
				valid: true,
				amount: parseFloat(coupon.amount),
				discountType: coupon.discount_type === 'percent' ? 'percent' : 'fixed',
				description: coupon.description || ''
			}
		} catch {
			return { valid: false, message: 'Ошибка проверки промокода' }
		}
	}

	private get retailCRMUrl() {
		return process.env.RETAILCRM_URL || 'https://koreacosmos.retailcrm.ru'
	}

	private get retailCRMApiKey() {
		return process.env.RETAILCRM_API_KEY
	}

	private async sendToRetailCRM(order: any, user: any, items: any[]) {
		try {
			await fetch(`${this.retailCRMUrl}/api/v5/orders/create`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'X-API-KEY': this.retailCRMApiKey
				},
				body: new URLSearchParams({
					order: JSON.stringify({
						externalId: order.id,
						channel: 'mobile-app',
						tags: [{ name: 'Мобильное приложение' }],
						customer: {
							externalId: order.userId,
							email: user.email
						},
						firstName: order.recipientDetails === 'other_recipient' ? (order.recipientName || user.name || '') : (user.name || ''),
						lastName: order.recipientDetails === 'other_recipient' ? (order.recipientSurname || user.surname || '') : (user.surname || ''),
						phone: order.recipientDetails === 'other_recipient' ? (order.recipientPhone || user.phone || '') : (user.phone || ''),
						email: order.recipientDetails === 'other_recipient' ? (order.recipientEmail || user.email || '') : (user.email || ''),
						customerComment: [order.comment, order.address?.comment]
							.filter(Boolean)
							.join(' | ') || undefined,
						delivery: {
							address: {
								text: [
									order.address?.city,
									order.address?.street,
									order.address?.house,
									order.address?.apartment ? `кв. ${order.address.apartment}` : null
								]
									.filter(Boolean)
									.join(', ')
							}
						},
						items: items.map(item => ({
							offer: { externalId: item.productId },
							quantity: item.quantity,
							initialPrice: item.price
						}))
					})
				}).toString()
			})
		} catch (e) {
			console.error('RetailCRM error:', e)
		}
	}

	private async getWooCommerceCustomerId(
		email: string
	): Promise<number | null> {
		try {
			const params = new URLSearchParams({ email, role: 'all' })
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/customers?${params}`,
				{
					headers: {
						Authorization:
							'Basic ' +
							Buffer.from(
								`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
							).toString('base64')
					}
				}
			)
			const data = await res.json()
			return data[0]?.id || null
		} catch {
			return null
		}
	}

	async getWooCommerceOrders(email: string) {
		const cached = this.wooOrdersCache.get(email)
		if (cached && Date.now() - cached.ts < this.WOO_CACHE_TTL) return cached.data

		try {
			const customerId = await this.getWooCommerceCustomerId(email)
			if (!customerId) return []

			const params = new URLSearchParams({
				customer: String(customerId),
				per_page: '50',
				orderby: 'date',
				order: 'desc'
			})
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/orders?${params}`,
				{
					headers: {
						Authorization:
							'Basic ' +
							Buffer.from(
								`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
							).toString('base64')
					}
				}
			)
			const orders = await res.json()
			if (!Array.isArray(orders)) return []

			const result = orders.map(o => ({
				id: String(o.id),
				number: o.number,
				status: this.mapWCStatus(o.status),
				totalPrice: Math.round(parseFloat(o.total)),
				deliveryPrice: Math.round(parseFloat(o.shipping_total || '0')),
				deliveryMethod: o.shipping_lines?.[0]?.method_id || null,
				createdAt: o.date_created,
				source: 'woocommerce',
				items: (o.line_items || []).map((li: any) => ({
					id: String(li.id),
					productId: null,
					quantity: li.quantity,
					price: Math.round(parseFloat(li.price)),
					productName: li.name,
					productImage: li.image?.src || '',
					product: { name: li.name, images: li.image?.src ? [li.image.src] : [] }
				}))
			}))
			this.wooOrdersCache.set(email, { data: result, ts: Date.now() })
			return result
		} catch {
			return []
		}
	}

	async getWooCommerceOrderById(wcId: string) {
		try {
			const wcAuth = Buffer.from(
				`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
			).toString('base64')

			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/orders/${wcId}`,
				{ headers: { Authorization: `Basic ${wcAuth}` } }
			)
			const o = await res.json()
			if (!o?.id) return null

			const shipping = o.shipping_lines?.[0]
			const deliveryPrice = Math.round(parseFloat(o.shipping_total || '0'))
			const trackingNumber = this.extractWcTrackingNumber(o.meta_data)

			return {
				id: String(o.id),
				number: o.number,
				status: this.mapWCStatus(o.status),
				totalPrice: Math.round(parseFloat(o.total)),
				deliveryPrice,
				deliveryMethod: shipping?.method_title || null,
				discountApplied: 0,
				createdAt: o.date_created,
				source: 'woocommerce',
				trackingNumber: trackingNumber || '',
				comment: o.customer_note || '',
				user: {
					name: o.billing?.first_name || '',
					surname: o.billing?.last_name || '',
					email: o.billing?.email || '',
					phone: o.billing?.phone || ''
				},
				address: o.billing?.address_1
					? {
							city: o.billing.city || '',
							street: o.billing.address_1 || '',
							postCode: o.billing.postcode || '',
							region: o.billing.city ? o.billing.city : o.billing.state || ''
					  }
					: null,
				items: (o.line_items || []).map((li: any) => ({
					id: String(li.id),
					quantity: li.quantity,
					price: Math.round(parseFloat(li.price)),
					product: {
						name: li.name,
						images: li.image?.src ? [li.image.src] : []
					}
				}))
			}
		} catch {
			return null
		}
	}

	private extractWcTrackingNumber(metaData: any[]): string | null {
		if (!Array.isArray(metaData)) return null

		// Advanced Shipment Tracking / WooCommerce Shipment Tracking plugin
		const trackingItems = metaData.find(
			m => m.key === '_wc_shipment_tracking_items'
		)
		if (trackingItems?.value?.[0]?.tracking_number) {
			return trackingItems.value[0].tracking_number
		}

		// Simple meta key fallback
		const simple = metaData.find(m => m.key === '_tracking_number')
		if (simple?.value) return String(simple.value)

		return null
	}

	private mapWCStatus(wcStatus: string): string {
		const map: Record<string, string> = {
			pending: 'pending',
			processing: 'payed',
			'on-hold': 'pending',
			completed: 'delivered',
			cancelled: 'cancelled',
			refunded: 'cancelled',
			failed: 'cancelled'
		}
		return map[wcStatus] || 'pending'
	}

	async updateRetailCRMStatus(orderId: string, status: string) {
		const retailStatus = this.mapToRetailCRMStatus(status)
		if (!retailStatus) return

		try {
			await fetch(`${this.retailCRMUrl}/api/v5/orders/${orderId}/edit`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'X-API-KEY': this.retailCRMApiKey
				},
				body: new URLSearchParams({
					by: 'externalId',
					order: JSON.stringify({ status: retailStatus })
				}).toString()
			})
		} catch (e) {
			console.error('RetailCRM status update error:', e)
		}
	}

	private mapToRetailCRMStatus(status: string): string | null {
		const map: Record<string, string> = {
			payed: 'prepayed',
			shipped: 'send-to-delivery',
			delivered: 'complete',
			cancelled: 'cancel-other',
			ready_to_receive: 'assembling-complete'
		}
		return map[status] || null
	}

	async updateWooCommerceStatus(orderId: string, status: string) {
		const wcStatus = this.mapToWooCommerceStatus(status)
		if (!wcStatus) return

		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: { wcOrderId: true }
		})
		if (!order?.wcOrderId) return

		try {
			await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/orders/${order.wcOrderId}`,
				{
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization:
							'Basic ' +
							Buffer.from(
								`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
							).toString('base64')
					},
					body: JSON.stringify({ status: wcStatus })
				}
			)
		} catch (e) {
			console.error('WooCommerce status update error:', e)
		}
	}

	private mapToWooCommerceStatus(status: string): string | null {
		const map: Record<string, string> = {
			pending: 'pending',
			payed: 'processing',
			shipped: 'delivering',
			ready_to_receive: 'on-hold',
			delivered: 'completed',
			cancelled: 'cancelled'
		}
		return map[status] || null
	}

	calculateBirthdayDiscount(dateOfBirth: Date) {
		const today = new Date()
		const birthDate = new Date(dateOfBirth)
		const daysToBirthday = this.calculateDaysBetween(today, birthDate)
		if (daysToBirthday <= 7 && daysToBirthday >= -7) return 20
		return 0
	}

	calculateDaysBetween(date1: Date, date2: Date): number {
		const timeDiff = date2.getTime() - date1.getTime()
		return Math.ceil(timeDiff / (1000 * 3600 * 24))
	}

	getApplicableDiscount(loyaltyDiscount: number, birthdayDiscount: number) {
		if (birthdayDiscount > 0) return birthdayDiscount
		return loyaltyDiscount
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

	async payOrder(orderId: string) {
		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: {
				totalPrice: true,
				userId: true,
				status: true,
				items: true,
				deliveryPrice: true,
				invoiceId: true
			}
		})

		if (!order) throw new NotFoundException('Заказ не найден')

		// Если invoiceId уже есть — используем его, иначе генерируем новый
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

	calculateTotalPriceWithDiscount(
		orderItems: any[],
		applicableDiscount: number
	) {
		return orderItems.reduce((acc, item) => {
			const isDiscountedCategory = item.product.categories.some(
				(category: any) =>
					category.name === 'Скидки' && category.section === 'Акции и скидки'
			)
			if (!isDiscountedCategory) {
				const discountedPrice =
					item.price - item.price * (applicableDiscount / 100)
				return acc + discountedPrice * item.quantity
			}
			return acc
		}, 0)
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

	async updateUserLoyaltyLevel(userId: string) {
		const userLoyalty = await this.prisma.userLoyalty.findUnique({
			where: { userId },
			include: { level: true }
		})

		if (!userLoyalty) return
		const { totalAmountSpent } = userLoyalty

		const newLevel = await this.prisma.loyaltyLevel.findFirst({
			where: { minAmount: { lte: totalAmountSpent } },
			orderBy: { minAmount: 'desc' }
		})

		if (newLevel && userLoyalty.levelId !== newLevel.id) {
			await this.prisma.userLoyalty.update({
				where: { userId },
				data: { currentDiscount: newLevel.discount, levelId: newLevel.id }
			})

			setTimeout(async () => {
				await this.notificationService.saveNotification(
					userId,
					`🌟 Новый статус — «${newLevel.name}»!`,
					`Поздравляем! Теперь ваша персональная скидка составляет ${newLevel.discount} %.`,
					{ discount: newLevel }
				)

				await this.notificationService.sendPushNotificationToUser(
					userId,
					`🌟 Новый статус — «${newLevel.name}»!`,
					`Поздравляем! Теперь ваша персональная скидка составляет ${newLevel.discount} %.`,
					{ discount: newLevel }
				)
			}, 10000)
		}
	}

	async update(id: string, dto: UpdateOrderDto) {
		const order = await this.getById(id)
		if (!order) throw new NotFoundException('Заказ не найден')

		const orderUpdated = await this.prisma.order.update({
			where: { id },
			include: { user: true },
			data: { status: dto.status }
		})

		this.updateWooCommerceStatus(id, dto.status).catch(() => null)

		if (dto.status === 'delivered' && orderUpdated.userId) {
			const amountToAdd = order.totalPrice - (order.deliveryPrice || 0)
			const userLoyalty = await this.prisma.userLoyalty.upsert({
				where: { userId: orderUpdated.userId },
				update: { totalAmountSpent: { increment: amountToAdd } },
				create: { userId: orderUpdated.userId, totalAmountSpent: amountToAdd, currentDiscount: 0 }
			})

			const newLevel = await this.prisma.loyaltyLevel.findFirst({
				where: { minAmount: { lte: userLoyalty.totalAmountSpent } },
				orderBy: { minAmount: 'desc' }
			})

			if (newLevel && userLoyalty.levelId !== newLevel.id) {
				await this.prisma.userLoyalty.update({
					where: { userId: orderUpdated.userId },
					data: { currentDiscount: newLevel.discount, levelId: newLevel.id }
				})
				setTimeout(async () => {
					await this.notificationService.saveNotification(
						orderUpdated.userId,
						`🌟 Новый статус — «${newLevel.name}»!`,
						`Поздравляем! Теперь ваша персональная скидка составляет ${newLevel.discount}%.`,
						{ discount: newLevel }
					)
					await this.notificationService.sendPushNotificationToUser(
						orderUpdated.userId,
						`🌟 Новый статус — «${newLevel.name}»!`,
						`Поздравляем! Теперь ваша персональная скидка составляет ${newLevel.discount}%.`,
						{ discount: newLevel }
					)
				}, 5000)
			}
		}

		setTimeout(async () => {
			const notification = await this.notificationService.saveNotification(
				orderUpdated.user.id,
				getOrderStatusIcons(dto.status),
				`Заказ #${orderUpdated.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(dto.status)}`,
				{ orderUserId: orderUpdated.id, status: orderUpdated.status }
			)

			await this.notificationService.sendPushNotificationToUser(
				orderUpdated.userId,
				`${getOrderStatusIcons(dto.status)}`,
				`Заказ #${orderUpdated.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(dto.status)}`,
				{
					orderUserId: orderUpdated.id,
					status: orderUpdated.status,
					notification: notification.id
				}
			)
		}, 2000)
	}

	async cancelOrder(id: string, userId: string, reason?: string) {
		const order = await this.getById(id)
		if (!order) throw new NotFoundException('Заказ не найден')
		if (order.userId !== userId) throw new ForbiddenException('Нет доступа к этому заказу')

		const cancellableStatuses = ['pending', 'payed']
		if (!cancellableStatuses.includes(order.status)) {
			throw new BadRequestException('Заказ в текущем статусе нельзя отменить')
		}

		if (order.status === 'payed') {
			const hoursSinceCreated = (Date.now() - new Date(order.createdAt).getTime()) / 3600000
			if (hoursSinceCreated > 1) {
				throw new BadRequestException('Время для отмены оплаченного заказа истекло (1 час)')
			}
		}

		const cancelled = await this.prisma.order.update({
			where: { id },
			include: { user: true },
			data: { status: 'cancelled', cancelReason: reason ?? null }
		})

		this.updateWooCommerceStatus(id, 'cancelled').catch(() => null)
		this.updateRetailCRMStatus(id, 'cancelled').catch(() => null)

		setTimeout(async () => {
			const notification = await this.notificationService.saveNotification(
				userId,
				'❌ Заказ отменён',
				`Заказ #${id.slice(0, 6).toUpperCase()} был отменён по вашему запросу.`,
				{ orderUserId: id, status: 'cancelled' }
			)
			await this.notificationService.sendPushNotificationToUser(
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
}
