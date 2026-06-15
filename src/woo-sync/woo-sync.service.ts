import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import {
	getOrderStatusIcons,
	getOrderStatusTranslation
} from 'src/utils/translate-status'
import { WooOrdersService } from './woo-orders.service'
import { WooProductsService } from './woo-products.service'
import { WC_TO_LOCAL } from './woo-status.constants'

@Injectable()
export class WooSyncService {
	private readonly logger = new Logger(WooSyncService.name)

	constructor(
		private readonly wooOrders: WooOrdersService,
		private readonly wooProducts: WooProductsService,
		private readonly prisma: PrismaService,
		private readonly notifications: NotificationsService
	) {}

	validateCoupon(code: string) {
		return this.wooOrders.validateCoupon(code)
	}
	getOrders(email: string) {
		return this.wooOrders.getOrders(email)
	}
	getOrderById(wcId: string) {
		return this.wooOrders.getOrderById(wcId)
	}
	mapStatus(wcStatus: string) {
		return this.wooOrders.mapStatus(wcStatus)
	}
	getLabelProducts() {
		return this.wooProducts.getLabelProducts()
	}

	createOrderInWooCommerce(
		userEmail: string,
		order: any,
		address: any | null,
		items: Array<{
			productId?: string | null
			quantity: number
			price: number
			productName?: string
		}>,
		userInfo?: { name?: string; surname?: string; phone?: string }
	) {
		return this.wooOrders.createOrderInWooCommerce(
			userEmail,
			order,
			address,
			items,
			userInfo
		)
	}

	updateOrderStatus(orderId: string, localStatus: string) {
		return this.wooOrders.updateOrderStatus(orderId, localStatus)
	}

	updateWooOrderById(wcId: number, localStatus: string) {
		return this.wooOrders.updateWooOrderById(wcId, localStatus)
	}

	updateCustomerDiscount(email: string, discount: number) {
		return this.wooOrders.updateCustomerDiscount(email, discount)
	}

	getCustomers(search?: string, page = 1) {
		return this.wooOrders.getCustomers(search, page)
	}

	getCustomerById(wcId: number) {
		return this.wooOrders.getCustomerById(wcId)
	}

	updateCustomerById(wcId: number, data: { firstName?: string; lastName?: string; phone?: string }) {
		return this.wooOrders.updateCustomerById(wcId, data)
	}

	getOrdersByEmailAdmin(email: string) {
		return this.wooOrders.getOrdersByEmailAdmin(email)
	}

	@Cron('0 */15 * * * *')
	async syncProductStock() {
		try {
			const localProducts = await this.prisma.product.findMany({
				select: { id: true, slug: true, inStock: true }
			})

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

			const wcProducts: any[] = await this.wooProducts.getProductsBySlugs(
				allSlugs
			)

			for (const wcProduct of wcProducts) {
				const slug = wcProduct.slug
				const wcInStock =
					wcProduct.stock_status === 'instock' ||
					wcProduct.stock_status === 'onbackorder'
				const localProduct = localProducts.find(p => p.slug === slug)

				if (localProduct) {
					if (wcInStock === localProduct.inStock) continue
					await this.prisma.product.update({
						where: { id: localProduct.id },
						data: { inStock: wcInStock }
					})
					if (wcInStock && !localProduct.inStock) {
						this.notifications
							.notifyUsersAboutProductInStock(localProduct.id)
							.catch(() => null)
						this.notifications
							.notifySubscribedUsersAboutStock(slug)
							.catch(() => null)
						this.logger.log(
							`Product ${slug} is back in stock → notifying users`
						)
					}
				} else if (extraSlugs.includes(slug) && wcInStock) {
					this.notifications
						.notifySubscribedUsersAboutStock(slug)
						.catch(() => null)
					this.logger.log(
						`WooCommerce-only product ${slug} is in stock → notifying subscribers`
					)
				}
			}
		} catch {
			// WP недоступен — пропускаем итерацию
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

			const wcOrders = await this.wooOrders.getOrdersByIds(
				orders.map(o => o.wcOrderId as number)
			)

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

				const title = `Заказ #${order.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(localStatus)}`
				const icon = getOrderStatusIcons(localStatus)
				const data = { orderUserId: order.id, status: localStatus }
				await this.notifications.saveNotification(
					order.userId,
					icon,
					title,
					data
				)
				await this.notifications.sendPushNotificationToUser(
					order.userId,
					icon,
					title,
					data
				)

				this.logger.log(
					`Order ${order.id} status: ${order.status} → ${localStatus}`
				)
			}
		} catch {
			// WP недоступен — пропускаем итерацию
		}
	}
}
