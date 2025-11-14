import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import {
	getOrderStatusIcons,
	getOrderStatusTranslation
} from 'src/utils/translate-status'

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
	private readonly url =
		process.env.RETAILCRM_URL || 'https://koreacosmos.retailcrm.ru'
	private readonly apiKey = process.env.RETAILCRM_API_KEY

	constructor(
		private prisma: PrismaService,
		private notificationService: NotificationsService
	) {}

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
}
