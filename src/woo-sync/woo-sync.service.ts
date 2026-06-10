import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import {
	getOrderStatusIcons,
	getOrderStatusTranslation
} from 'src/utils/translate-status'

const WC_TO_LOCAL: Record<string, string> = {
	pending: 'pending',
	processing: 'payed',
	'on-hold': 'pending',
	delivering: 'shipped',
	completed: 'delivered',
	cancelled: 'cancelled',
	refunded: 'cancelled',
	failed: 'cancelled'
}

const LOCAL_TO_WC: Record<string, string> = {
	pending: 'pending',
	payed: 'processing',
	shipped: 'delivering',
	ready_to_receive: 'on-hold',
	delivered: 'completed',
	cancelled: 'cancelled'
}

@Injectable()
export class WooSyncService {
	private readonly logger = new Logger(WooSyncService.name)
	private readonly auth =
		'Basic ' +
		Buffer.from(
			`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
		).toString('base64')

	private ordersCache = new Map<string, { data: any[]; ts: number }>()
	private readonly ORDERS_CACHE_TTL = 3 * 60 * 1000

	constructor(
		private prisma: PrismaService,
		private notificationService: NotificationsService
	) {}

	async validateCoupon(code: string) {
		try {
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/coupons?code=${encodeURIComponent(
					code
				)}`,
				{ headers: { Authorization: this.auth } }
			)
			const data = await res.json()
			const coupon = data?.[0]
			if (!coupon) return { valid: false, message: 'Промокод не найден' }
			if (coupon.status !== 'publish')
				return { valid: false, message: 'Промокод неактивен' }
			if (coupon.date_expires && new Date(coupon.date_expires) < new Date())
				return { valid: false, message: 'Срок действия промокода истёк' }
			if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit)
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

	async getOrders(email: string) {
		const cached = this.ordersCache.get(email)
		if (cached && Date.now() - cached.ts < this.ORDERS_CACHE_TTL)
			return cached.data

		try {
			const customerId = await this.getCustomerId(email)
			if (!customerId) return []

			const params = new URLSearchParams({
				customer: String(customerId),
				per_page: '50',
				orderby: 'date',
				order: 'desc'
			})
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/orders?${params}`,
				{ headers: { Authorization: this.auth } }
			)
			const orders = await res.json()
			if (!Array.isArray(orders)) return []

			const result = orders.map(o => ({
				id: String(o.id),
				number: o.number,
				status: this.mapStatus(o.status),
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
					product: {
						name: li.name,
						images: li.image?.src ? [li.image.src] : []
					}
				}))
			}))
			this.ordersCache.set(email, { data: result, ts: Date.now() })
			return result
		} catch {
			return []
		}
	}

	async getOrderById(wcId: string) {
		try {
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/orders/${wcId}`,
				{ headers: { Authorization: this.auth } }
			)
			const o = await res.json()
			if (!o?.id) return null

			return {
				id: String(o.id),
				number: o.number,
				status: this.mapStatus(o.status),
				totalPrice: Math.round(parseFloat(o.total)),
				deliveryPrice: Math.round(parseFloat(o.shipping_total || '0')),
				deliveryMethod: o.shipping_lines?.[0]?.method_title || null,
				discountApplied: 0,
				createdAt: o.date_created,
				source: 'woocommerce',
				trackingNumber: this.extractTrackingNumber(o.meta_data) || '',
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
							region: o.billing.city || o.billing.state || ''
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

	async updateOrderStatus(orderId: string, localStatus: string) {
		const wcStatus = LOCAL_TO_WC[localStatus]
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
						Authorization: this.auth
					},
					body: JSON.stringify({ status: wcStatus })
				}
			)
		} catch (e) {
			this.logger.error('WooCommerce status update error:', e)
		}
	}

	private async getCustomerId(email: string): Promise<number | null> {
		try {
			const params = new URLSearchParams({ email, role: 'all' })
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/customers?${params}`,
				{ headers: { Authorization: this.auth } }
			)
			const data = await res.json()
			return data[0]?.id || null
		} catch {
			return null
		}
	}

	mapStatus(wcStatus: string): string {
		return WC_TO_LOCAL[wcStatus] || 'pending'
	}

	private extractTrackingNumber(metaData: any[]): string | null {
		if (!Array.isArray(metaData)) return null
		const tracking = metaData.find(m => m.key === '_wc_shipment_tracking_items')
		if (tracking?.value?.[0]?.tracking_number)
			return tracking.value[0].tracking_number
		const simple = metaData.find(m => m.key === '_tracking_number')
		return simple?.value ? String(simple.value) : null
	}

	@Cron('0 */15 * * * *')
	async syncProductStock() {
		try {
			const localProducts = await this.prisma.product.findMany({
				select: { id: true, slug: true, inStock: true }
			})

			// Slug'и из подписок которые не покрыты локальной БД
			const subSlugs = await this.prisma.productSubscriptions.findMany({
				select: { productId: true },
				distinct: ['productId']
			})
			const localSlugsSet = new Set(localProducts.map(p => p.slug))
			const extraSlugs = subSlugs
				.map(s => s.productId)
				.filter(slug => !localSlugsSet.has(slug))

			const allSlugs = [...localProducts.map(p => p.slug), ...extraSlugs]
			if (!allSlugs.length) return

			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/products?slug=${allSlugs.join(
					','
				)}&per_page=100`,
				{ headers: { Authorization: this.auth } }
			)
			if (!res.ok) return

			const wcProducts: any[] = await res.json()

			for (const wcProduct of wcProducts) {
				const slug = wcProduct.slug
				const wcInStock =
					wcProduct.stock_status === 'instock' ||
					wcProduct.stock_status === 'onbackorder'

				const localProduct = localProducts.find(p => p.slug === slug)

				if (localProduct) {
					// Товар есть в локальной БД
					if (wcInStock === localProduct.inStock) continue

					await this.prisma.product.update({
						where: { id: localProduct.id },
						data: { inStock: wcInStock }
					})

					if (wcInStock && !localProduct.inStock) {
						this.notificationService
							.notifyUsersAboutProductInStock(localProduct.id)
							.catch(() => null)
						this.notificationService
							.notifySubscribedUsersAboutStock(slug)
							.catch(() => null)
						this.logger.log(
							`Product ${slug} is back in stock → notifying users`
						)
					}
				} else if (extraSlugs.includes(slug)) {
					// Товар только в WooCommerce — шлём пуши подписчикам если появился
					// Предыдущего статуса нет — сохраняем текущий и сравним в следующем цикле
					// Но если wcInStock=true и подписки есть — шлём (первый раз когда видим в наличии)
					if (wcInStock) {
						this.notificationService
							.notifySubscribedUsersAboutStock(slug)
							.catch(() => null)
						this.logger.log(
							`WooCommerce-only product ${slug} is in stock → notifying subscribers`
						)
					}
				}
			}
		} catch (err) {
			this.logger.error('Product stock sync failed', err)
		}
	}

	@Cron('0 */10 * * * *')
	async syncOrderStatuses() {
		try {
			const orders = await this.prisma.order.findMany({
				where: {
					wcOrderId: { not: null },
					status: { notIn: ['delivered', 'cancelled'] },
					createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
				},
				select: { id: true, wcOrderId: true, status: true, userId: true }
			})

			if (!orders.length) return

			const wcIds = orders.map(o => o.wcOrderId).join(',')
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/orders?include=${wcIds}&per_page=100`,
				{ headers: { Authorization: this.auth } }
			)
			if (!res.ok) return

			const wcOrders: any[] = await res.json()
			if (!Array.isArray(wcOrders)) return

			for (const wcOrder of wcOrders) {
				const order = orders.find(
					o => String(o.wcOrderId) === String(wcOrder.id)
				)
				if (!order) continue

				const localStatus = WC_TO_LOCAL[wcOrder.status as string]
				if (!localStatus || localStatus === order.status) continue

				await this.prisma.order.update({
					where: { id: order.id },
					data: { status: localStatus as any }
				})

				await this.notificationService.saveNotification(
					order.userId,
					getOrderStatusIcons(localStatus),
					`Заказ #${order.id
						.slice(0, 6)
						.toUpperCase()} ${getOrderStatusTranslation(localStatus)}`,
					{ orderUserId: order.id, status: localStatus }
				)
				await this.notificationService.sendPushNotificationToUser(
					order.userId,
					getOrderStatusIcons(localStatus),
					`Заказ #${order.id
						.slice(0, 6)
						.toUpperCase()} ${getOrderStatusTranslation(localStatus)}`,
					{ orderUserId: order.id, status: localStatus }
				)

				this.logger.log(
					`Order ${order.id} status: ${order.status} → ${localStatus}`
				)
			}
		} catch (err) {
			this.logger.error('WooSync cron failed', err)
		}
	}
}
