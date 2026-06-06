import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
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

@Injectable()
export class WooSyncService {
	private readonly logger = new Logger(WooSyncService.name)
	private readonly auth =
		'Basic ' +
		Buffer.from(
			`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
		).toString('base64')

	constructor(
		private prisma: PrismaService,
		private notificationService: NotificationsService
	) {}

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

			const allSlugs = [
				...localProducts.map(p => p.slug),
				...extraSlugs
			]
			if (!allSlugs.length) return

			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/products?slug=${allSlugs.join(',')}&per_page=100`,
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
						this.logger.log(`Product ${slug} is back in stock → notifying users`)
					}
				} else if (extraSlugs.includes(slug)) {
					// Товар только в WooCommerce — шлём пуши подписчикам если появился
					// Предыдущего статуса нет — сохраняем текущий и сравним в следующем цикле
					// Но если wcInStock=true и подписки есть — шлём (первый раз когда видим в наличии)
					if (wcInStock) {
						this.notificationService
							.notifySubscribedUsersAboutStock(slug)
							.catch(() => null)
						this.logger.log(`WooCommerce-only product ${slug} is in stock → notifying subscribers`)
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
				const order = orders.find(o => String(o.wcOrderId) === String(wcOrder.id))
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
					`Заказ #${order.id.slice(0, 6).toUpperCase()} ${getOrderStatusTranslation(localStatus)}`,
					{ orderUserId: order.id, status: localStatus }
				)
				await this.notificationService.sendPushNotificationToUser(
					order.userId,
					getOrderStatusIcons(localStatus),
					`Заказ #${order.id.slice(0, 6).toUpperCase()} ${getOrderStatusTranslation(localStatus)}`,
					{ orderUserId: order.id, status: localStatus }
				)

				this.logger.log(`Order ${order.id} status: ${order.status} → ${localStatus}`)
			}
		} catch (err) {
			this.logger.error('WooSync cron failed', err)
		}
	}
}
