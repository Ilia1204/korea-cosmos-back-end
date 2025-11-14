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

	@Cron(CronExpression.EVERY_5_MINUTES)
	async syncProductStock() {
		try {
			// Берём все локальные товары у которых есть wooProductId (хранится в поле slug или нужна связь)
			// Получаем все локальные продукты
			const localProducts = await this.prisma.product.findMany({
				select: { id: true, slug: true, inStock: true }
			})
			if (!localProducts.length) return

			// Запрашиваем WooCommerce — batch по slug
			const slugs = localProducts.map(p => p.slug).join(',')
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/products?slug=${slugs}&per_page=100`,
				{ headers: { Authorization: this.auth } }
			)
			if (!res.ok) return

			const wcProducts: any[] = await res.json()

			for (const wcProduct of wcProducts) {
				const localProduct = localProducts.find(p => p.slug === wcProduct.slug)
				if (!localProduct) continue

				const wcInStock =
					wcProduct.stock_status === 'instock' ||
					wcProduct.stock_status === 'onbackorder'

				if (wcInStock === localProduct.inStock) continue

				// Статус изменился — обновляем локально
				await this.prisma.product.update({
					where: { id: localProduct.id },
					data: { inStock: wcInStock }
				})

				// Если товар снова появился в наличии — шлём пуши
				if (wcInStock && !localProduct.inStock) {
					this.notificationService
						.notifyUsersAboutProductInStock(localProduct.id)
						.catch(() => null)
					this.notificationService
						.notifySubscribedUsersAboutStock(localProduct.id)
						.catch(() => null)
					this.logger.log(`Product ${localProduct.slug} is back in stock → notifying users`)
				}
			}
		} catch (err) {
			this.logger.error('Product stock sync failed', err)
		}
	}

	@Cron(CronExpression.EVERY_5_MINUTES)
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

			for (const order of orders) {
				try {
					const res = await fetch(
						`${process.env.WP_URL}/wp-json/wc/v3/orders/${order.wcOrderId}`,
						{ headers: { Authorization: this.auth } }
					)
					if (!res.ok) continue

					const wcOrder = await res.json()
					const wcStatus: string = wcOrder.status
					const localStatus = WC_TO_LOCAL[wcStatus]

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
				} catch (err) {
					this.logger.warn(`Failed to sync WC order ${order.wcOrderId}: ${err}`)
				}
			}
		} catch (err) {
			this.logger.error('WooSync cron failed', err)
		}
	}
}
