import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from 'src/prisma.service'
import { DeliveryService } from './delivery.service'

@Injectable()
export class CdekTrackingService {
	private readonly logger = new Logger(CdekTrackingService.name)

	constructor(
		private readonly prisma: PrismaService,
		private readonly delivery: DeliveryService
	) {}

	// Frequent poll for recently created orders — cdek_number is assigned at creation
	@Cron(CronExpression.EVERY_MINUTE)
	async syncRecentCdekTrackingNumbers() {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
		await this.pollOrders({ createdAt: { gte: twoHoursAgo } })
	}

	// Fallback for older orders still missing a tracking number
	@Cron(CronExpression.EVERY_30_MINUTES)
	async syncOldCdekTrackingNumbers() {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
		await this.pollOrders({ createdAt: { lt: twoHoursAgo } })
	}

	async pollForOrder(orderId: string, cdekUuid: string) {
		const trackingNumber = await this.delivery.getCdekTrackingNumber(cdekUuid)
		if (!trackingNumber) return

		await this.prisma.order.update({
			where: { id: orderId },
			data: { trackingNumber }
		})
		this.logger.log(`Order ${orderId}: tracking number saved — ${trackingNumber}`)
	}

	private async pollOrders(createdAtFilter: object) {
		const orders = await this.prisma.order.findMany({
			where: {
				deliveryMethod: 'sdec',
				cdekUuid: { not: null },
				OR: [{ trackingNumber: null }, { trackingNumber: '' }],
				...createdAtFilter
			},
			select: { id: true, cdekUuid: true }
		})

		if (!orders.length) return

		this.logger.log(`Polling CDEK tracking for ${orders.length} order(s)...`)

		for (const order of orders) {
			const trackingNumber = await this.delivery.getCdekTrackingNumber(order.cdekUuid)
			if (!trackingNumber) continue

			await this.prisma.order.update({
				where: { id: order.id },
				data: { trackingNumber }
			})
			this.logger.log(`Order ${order.id}: tracking number saved — ${trackingNumber}`)
		}
	}
}
