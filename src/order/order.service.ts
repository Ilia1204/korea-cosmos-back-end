import { Injectable, NotFoundException } from '@nestjs/common'
import { EnumOrderStatus } from '@prisma/client'
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
		const applicableDiscount = this.getApplicableDiscount(discount, birthdayDiscount)

		const totalPriceWithDiscount = dto.items.reduce((acc, item) => {
			const discountedPrice = item.price - item.price * (applicableDiscount / 100)
			return acc + discountedPrice * item.quantity
		}, 0)

		const totalPriceWithDelivery = totalPriceWithDiscount + (dto.deliveryPrice || 0)

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
		this.sendToWooCommerce(order, user, dto.items).catch(() => null)

		setTimeout(async () => {
			await this.notificationService.sendPushNotificationToAdmins(
				'🛍️ Новый заказ',
				`Пришёл новый заказ с id: #${order.id.slice(0, 6).toUpperCase()}`,
				{ orderId: order.id, isRead: true }
			)
		}, 2000)

		const paymentUrl = this.robokassa.generatePaymentUrl(
			invoiceId,
			totalPriceWithDelivery,
			`Заказ #${order.id.slice(0, 6).toUpperCase()}`
		)

		return { confirmation: { confirmation_url: paymentUrl } }
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
						customer: { email: user.email },
						firstName: user.name || '',
						lastName: user.surname || '',
						phone: user.phone || '',
						email: user.email || '',
						delivery: {
							address: {
								text: [order.address?.city, order.address?.street]
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

	private async sendToWooCommerce(order: any, user: any, items: any[]) {
		const wcCustomer = await this.getWooCommerceCustomerId(user.email)

		const lineItems = await Promise.all(
			items.map(async item => {
				const product = await this.prisma.product.findUnique({
					where: { id: item.productId },
					select: { name: true }
				})
				return {
					name: product?.name || 'Товар',
					quantity: item.quantity,
					subtotal: String(item.price * item.quantity),
					total: String(item.price * item.quantity)
				}
			})
		)

		const wcOrder: any = {
			status: 'pending',
			currency: 'RUB',
			meta_data: [{ key: 'mobile_order_id', value: order.id }],
			line_items: lineItems,
			billing: {
				first_name: user.name || '',
				last_name: user.surname || '',
				email: user.email || '',
				phone: user.phone || ''
			}
		}
		if (wcCustomer) wcOrder.customer_id = wcCustomer

		const res = await fetch(`${process.env.WP_URL}/wp-json/wc/v3/orders`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization:
					'Basic ' +
					Buffer.from(
						`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
					).toString('base64')
			},
			body: JSON.stringify(wcOrder)
		})
		const wcCreated = await res.json().catch(() => null)
		if (wcCreated?.id) {
			await this.prisma.order.update({
				where: { id: order.id },
				data: { wcOrderId: wcCreated.id }
			})
		}
	}

	private async getWooCommerceCustomerId(email: string): Promise<number | null> {
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

			return orders.map(o => ({
				id: String(o.id),
				number: o.number,
				status: this.mapWCStatus(o.status),
				totalPrice: Math.round(parseFloat(o.total)),
				createdAt: o.date_created,
				source: 'woocommerce',
				items: (o.line_items || []).map((li: any) => ({
					id: String(li.id),
					productId: null,
					quantity: li.quantity,
					price: Math.round(parseFloat(li.price)),
					product: { name: li.name, images: [] }
				}))
			}))
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
							region: o.billing.city
								? o.billing.city
								: o.billing.state || ''
						}
					: null,
				items: (o.line_items || []).map((li: any) => ({
					id: String(li.id),
					quantity: li.quantity,
					price: Math.round(parseFloat(li.price)),
					product: { name: li.name, images: li.image?.src ? [li.image.src] : [] }
				}))
			}
		} catch {
			return null
		}
	}

	private mapWCStatus(wcStatus: string): string {
		const map: Record<string, string> = {
			pending: 'pending',
			processing: 'payed',
			'on-hold': 'payed',
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
			await fetch(
				`${this.retailCRMUrl}/api/v5/orders/${orderId}/edit`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'X-API-KEY': this.retailCRMApiKey
					},
					body: new URLSearchParams({
						by: 'externalId',
						order: JSON.stringify({ status: retailStatus })
					}).toString()
				}
			)
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

	calculateTotalPriceWithDiscount(orderItems: any[], applicableDiscount: number) {
		return orderItems.reduce((acc, item) => {
			const isDiscountedCategory = item.product.categories.some(
				(category: any) =>
					category.name === 'Скидки' && category.section === 'Акции и скидки'
			)
			if (!isDiscountedCategory) {
				const discountedPrice = item.price - item.price * (applicableDiscount / 100)
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
					`🌟 Присвоение статуса «${newLevel.name}»`,
					`Поздравляем! Теперь ваша персональная скидка составляет ${newLevel.discount} %.`,
					{ discount: newLevel }
				)

				await this.notificationService.sendPushNotificationToUser(
					userId,
					`🌟 Присвоение статуса «${newLevel.name}»`,
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

		setTimeout(async () => {
			const notification = await this.notificationService.saveNotification(
				orderUpdated.user.id,
				getOrderStatusIcons(dto.status),
				`Заказ #${orderUpdated.id.slice(0, 6).toUpperCase()} ${getOrderStatusTranslation(dto.status)}`,
				{ orderUserId: orderUpdated.id, status: orderUpdated.status }
			)

			await this.notificationService.sendPushNotificationToUser(
				orderUpdated.userId,
				`${getOrderStatusIcons(dto.status)}`,
				`Заказ #${orderUpdated.id.slice(0, 6).toUpperCase()} ${getOrderStatusTranslation(dto.status)}`,
				{
					orderUserId: orderUpdated.id,
					status: orderUpdated.status,
					notification: notification.id
				}
			)
		}, 2000)
	}

	async delete(id: string) {
		const order = await this.getById(id)
		if (!order) throw new NotFoundException('Заказ не найден')
		return this.prisma.order.delete({ where: { id } })
	}
}
