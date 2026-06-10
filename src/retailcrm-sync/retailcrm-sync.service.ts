import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import {
	getOrderStatusIcons,
	getOrderStatusTranslation
} from 'src/utils/translate-status'

const LOCAL_TO_RETAILCRM: Record<string, string> = {
	payed: 'prepayed',
	shipped: 'send-to-delivery',
	delivered: 'complete',
	cancelled: 'cancel-other',
	ready_to_receive: 'assembling-complete'
}

const RETAILCRM_TO_LOCAL: Record<string, string> = {
	prepayed: 'payed',
	'client-confirmed': 'payed',
	'send-to-delivery': 'shipped',
	delivering: 'shipped',
	complete: 'delivered',
	'cancel-other': 'cancelled',
	'no-call': 'cancelled',
	'no-product': 'cancelled',
	'assembling-complete': 'ready_to_receive'
}

@Injectable()
export class RetailCRMSyncService {
	private readonly logger = new Logger(RetailCRMSyncService.name)
	private readonly url: string
	private readonly apiKey: string

	constructor(
		private prisma: PrismaService,
		private notificationService: NotificationsService,
		private configService: ConfigService
	) {
		this.url =
			this.configService.get('RETAILCRM_URL') ||
			'https://koreacosmos.retailcrm.ru'
		this.apiKey = this.configService.get('RETAILCRM_API_KEY')
	}

	@Cron(CronExpression.EVERY_5_MINUTES)
	async syncOrderStatuses() {
		if (!this.apiKey) return

		try {
			const activeOrders = await this.prisma.order.findMany({
				where: {
					status: { notIn: ['delivered', 'cancelled'] as any[] },
					createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
				},
				select: { id: true, status: true, userId: true }
			})

			if (!activeOrders.length) return

			const params = new URLSearchParams({ limit: '50' })
			activeOrders.forEach(o => params.append('filter[externalIds][]', o.id))

			const res = await fetch(`${this.url}/api/v5/orders?${params}`, {
				headers: { 'X-API-KEY': this.apiKey }
			})
			const data = await res.json()

			if (!data.success || !data.orders?.length) return

			for (const retailOrder of data.orders) {
				const externalId = retailOrder.externalId
				if (!externalId) continue

				const localStatus = RETAILCRM_TO_LOCAL[retailOrder.status]
				if (!localStatus) continue

				const localOrder = activeOrders.find(o => o.id === externalId)
				if (!localOrder || localOrder.status === localStatus) continue

				const updated = await this.prisma.order.update({
					where: { id: externalId },
					data: { status: localStatus as any }
				})

				const notification = await this.notificationService.saveNotification(
					updated.userId,
					getOrderStatusIcons(localStatus),
					`Заказ #${updated.id
						.slice(0, 6)
						.toUpperCase()} ${getOrderStatusTranslation(localStatus)}`,
					{ orderUserId: updated.id, status: localStatus }
				)

				await this.notificationService.sendPushNotificationToUser(
					updated.userId,
					getOrderStatusIcons(localStatus),
					`Заказ #${updated.id
						.slice(0, 6)
						.toUpperCase()} ${getOrderStatusTranslation(localStatus)}`,
					{
						orderUserId: updated.id,
						status: localStatus,
						notification: notification.id
					}
				)

				this.logger.log(
					`Synced ${externalId}: ${localOrder.status} → ${localStatus}`
				)
			}
		} catch (e) {
			this.logger.error('RetailCRM sync error:', e)
		}
	}

	async createOrder(order: any, user: any, items: any[]) {
		try {
			await fetch(`${this.url}/api/v5/orders/create`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'X-API-KEY': this.apiKey
				},
				body: new URLSearchParams({
					order: JSON.stringify({
						externalId: order.id,
						channel: 'mobile-app',
						tags: [{ name: 'Мобильное приложение' }],
						customer: { externalId: order.userId, email: user.email },
						firstName:
							order.recipientDetails === 'other_recipient'
								? order.recipientName || user.name || ''
								: user.name || '',
						lastName:
							order.recipientDetails === 'other_recipient'
								? order.recipientSurname || user.surname || ''
								: user.surname || '',
						phone:
							order.recipientDetails === 'other_recipient'
								? order.recipientPhone || user.phone || ''
								: user.phone || '',
						email:
							order.recipientDetails === 'other_recipient'
								? order.recipientEmail || user.email || ''
								: user.email || '',
						customerComment:
							[order.comment, order.address?.comment]
								.filter(Boolean)
								.join(' | ') || undefined,
						delivery: {
							address: {
								text: [
									order.address?.city,
									order.address?.street,
									order.address?.house,
									order.address?.apartment
										? `кв. ${order.address.apartment}`
										: null
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
			this.logger.error('RetailCRM createOrder error:', e)
		}
	}

	async updateOrderStatus(orderId: string, localStatus: string) {
		const retailStatus = LOCAL_TO_RETAILCRM[localStatus]
		if (!retailStatus) return
		try {
			await fetch(`${this.url}/api/v5/orders/${orderId}/edit`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'X-API-KEY': this.apiKey
				},
				body: new URLSearchParams({
					by: 'externalId',
					order: JSON.stringify({ status: retailStatus })
				}).toString()
			})
		} catch (e) {
			this.logger.error('RetailCRM updateOrderStatus error:', e)
		}
	}
}
