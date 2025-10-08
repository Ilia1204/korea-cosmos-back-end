import { Body, Controller, Get, Post, Res } from '@nestjs/common'
import { Response } from 'express'
import { PrismaService } from 'src/prisma.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { getOrderStatusIcons, getOrderStatusTranslation } from 'src/utils/translate-status'
import { RobokassaService } from './robokassa.service'

@Controller('robokassa')
export class RobokassaController {
	constructor(
		private readonly robokassa: RobokassaService,
		private readonly prisma: PrismaService,
		private readonly notificationService: NotificationsService
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

		if (updated.userId) {
			const userLoyalty = await this.prisma.userLoyalty.upsert({
				where: { userId: updated.userId },
				update: {
					totalAmountSpent: { increment: updated.totalPrice - updated.deliveryPrice }
				},
				create: {
					userId: updated.userId,
					totalAmountSpent: updated.totalPrice - updated.deliveryPrice,
					currentDiscount: 0
				}
			})

			// Проверяем достиг ли пользователь нового уровня лояльности
			const newLevel = await this.prisma.loyaltyLevel.findFirst({
				where: { minAmount: { lte: userLoyalty.totalAmountSpent } },
				orderBy: { minAmount: 'desc' }
			})

			if (newLevel && userLoyalty.levelId !== newLevel.id) {
				await this.prisma.userLoyalty.update({
					where: { userId: updated.userId },
					data: { currentDiscount: newLevel.discount, levelId: newLevel.id }
				})

				setTimeout(async () => {
					await this.notificationService.saveNotification(
						updated.userId,
						`🌟 Присвоение статуса «${newLevel.name}»`,
						`Поздравляем! Теперь ваша персональная скидка составляет ${newLevel.discount}%.`,
						{ discount: newLevel }
					)
					await this.notificationService.sendPushNotificationToUser(
						updated.userId,
						`🌟 Присвоение статуса «${newLevel.name}»`,
						`Поздравляем! Теперь ваша персональная скидка составляет ${newLevel.discount}%.`,
						{ discount: newLevel }
					)
				}, 5000)
			}
		}

		setTimeout(async () => {
			const notification = await this.notificationService.saveNotification(
				updated.userId,
				getOrderStatusIcons(updated.status),
				`Заказ #${updated.id.slice(0, 6).toUpperCase()} ${getOrderStatusTranslation(updated.status)}`,
				{ orderUserId: updated.id, status: updated.status }
			)

			await this.notificationService.sendPushNotificationToUser(
				updated.userId,
				getOrderStatusIcons(updated.status),
				`Заказ #${updated.id.slice(0, 6).toUpperCase()} ${getOrderStatusTranslation(updated.status)}`,
				{ orderUserId: updated.id, status: updated.status, notification: notification.id }
			)
		}, 2000)

		// Robokassa требует ответ ровно OK{InvId}
		return res.status(200).send(`OK${InvId}`)
	}

	@Get('success')
	success(@Res() res: Response) {
		return res.redirect('https://koreacosmos.ru?payment=success')
	}

	@Get('fail')
	fail(@Res() res: Response) {
		return res.redirect('https://koreacosmos.ru?payment=fail')
	}
}
