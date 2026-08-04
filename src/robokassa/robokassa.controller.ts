import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common'
import { Response } from 'express'
import { OrderService } from 'src/order/order.service'
import { PrismaService } from 'src/prisma.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import {
	getOrderStatusIcons,
	getOrderStatusTranslation
} from 'src/utils/translate-status'
import { RobokassaService } from './robokassa.service'

@Controller('robokassa')
export class RobokassaController {
	constructor(
		private readonly robokassa: RobokassaService,
		private readonly prisma: PrismaService,
		private readonly notificationService: NotificationsService,
		private readonly orderService: OrderService
	) {}

	@Post('result')
	async result(@Body() body: any, @Res() res: Response) {
		const { OutSum, InvId, SignatureValue } = body

		if (!this.robokassa.verifyResult(OutSum, InvId, SignatureValue)) {
			return res.status(400).send('bad sign')
		}

		const invoiceId = parseInt(InvId)
		const order = await this.prisma.order.findUnique({
			where: { invoiceId },
			include: { user: true }
		})

		if (!order) return res.status(404).send('order not found')

		const updated = await this.prisma.order.update({
			where: { invoiceId },
			data: { status: 'payed' }
		})

		this.orderService.markAsPaid(updated.id)

		setTimeout(async () => {
			const notification = await this.notificationService.saveNotification(
				updated.userId,
				getOrderStatusIcons(updated.status),
				`Заказ #${updated.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(updated.status)}`,
				{ orderUserId: updated.id, status: updated.status }
			)

			await this.notificationService.sendPushNotificationToUser(
				updated.userId,
				getOrderStatusIcons(updated.status),
				`Заказ #${updated.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(updated.status)}`,
				{
					orderUserId: updated.id,
					status: updated.status,
					notification: notification.id
				}
			)
		}, 2000)

		return res.status(200).send(`OK${InvId}`)
	}

	@Get('success')
	async success(@Query('InvId') invId: string, @Res() res: Response) {
		const invoiceId = parseInt(invId)
		const order = await this.prisma.order.findUnique({
			where: { invoiceId },
			select: { id: true }
		})

		if (!order) return res.redirect('koreacosmos:///payment-success')

		return res.redirect(`koreacosmos:///payment-success?orderId=${order.id}`)
	}

	@Get('fail')
	fail(@Res() res: Response) {
		return res.redirect('koreacosmos:///payment-fail')
	}
}
