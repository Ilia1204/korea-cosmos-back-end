import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from 'src/prisma.service'
import { DeliveryService } from './delivery.service'

@Injectable()
export class RussianPostTrackingService {
	private readonly logger = new Logger(RussianPostTrackingService.name)

	constructor(
		private readonly prisma: PrismaService,
		private readonly delivery: DeliveryService
	) {}

	@Cron(CronExpression.EVERY_MINUTE)
	async syncRecentBarcodes() {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
		await this.pollOrders({ createdAt: { gte: twoHoursAgo } })
	}

	@Cron(CronExpression.EVERY_30_MINUTES)
	async syncOldBarcodes() {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
		await this.pollOrders({ createdAt: { lt: twoHoursAgo } })
	}

	private async pollOrders(createdAtFilter: object) {
		const orders = await this.prisma.order.findMany({
			where: {
				deliveryMethod: 'russian_post',
				russianPostId: { not: null },
				OR: [{ trackingNumber: null }, { trackingNumber: '' }],
				...createdAtFilter
			},
			select: { id: true, russianPostId: true }
		})

		if (!orders.length) return

		this.logger.log(`Polling Russian Post barcodes for ${orders.length} order(s)...`)

		for (const order of orders) {
			const barcode = await this.delivery.getRussianPostBarcode(Number(order.russianPostId))
			if (!barcode) continue

			await this.prisma.order.update({
				where: { id: order.id },
				data: { trackingNumber: barcode }
			})
			this.logger.log(`Order ${order.id}: Russian Post barcode saved — ${barcode}`)
		}
	}
}
