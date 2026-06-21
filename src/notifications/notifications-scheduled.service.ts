import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from 'src/prisma.service'
import { NotificationsService } from './notifications.service'

@Injectable()
export class NotificationsScheduledService {
	constructor(
		private prisma: PrismaService,
		private notifications: NotificationsService
	) {}

	@Cron('0 12 * * *')
	async handleReviewReminders() {
		const from = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
		const to = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

		const orders = await this.prisma.order.findMany({
			where: { status: 'delivered', updatedAt: { gte: from, lt: to } },
			include: { items: true }
		})

		for (const order of orders) {
			if (!order.userId) continue

			const notification = await this.notifications.saveNotification(
				order.userId,
				'⭐ Как вам покупка?',
				'Расскажите о товаре — ваш отзыв поможет другим покупателям.',
				{ reviewReminder: true, orderUserId: order.id }
			)

			this.notifications.sendPushNotificationToUser(
				order.userId,
				'⭐ Как вам покупка?',
				'Расскажите о товаре — ваш отзыв поможет другим покупателям.',
				{
					reviewReminder: true,
					orderUserId: order.id,
					notificationId: notification.id
				}
			)
		}
	}

	@Cron('0 15 15 * *')
	async handleProfileReminder() {
		const users = await this.prisma.user.findMany({
			where: {
				OR: [
					{ name: '' },
					{ surname: '' },
					{
						addresses: {
							some: {
								region: '',
								city: '',
								postCode: '',
								street: '',
								house: '',
								apartment: ''
							}
						}
					}
				]
			}
		})

		users.forEach(user => {
			setTimeout(() => {
				this.notifications
					.saveNotification(
						user.id,
						'🙎🏻‍♂️ Заполните свой профиль',
						'Некоторые поля в вашем профиле не заполнены. Пожалуйста, обновите информацию.',
						{ editProfileNavigate: 'EditProfile' }
					)
					.then(notification =>
						this.notifications.sendPushNotificationToUser(
							user.id,
							'🙎🏻‍♂️ Заполните свой профиль',
							'Некоторые поля в вашем профиле не заполнены. Пожалуйста, обновите информацию.',
							{
								editProfileNavigate: 'EditProfile',
								notificationId: notification.id
							}
						)
					)
					.catch(() => {})
			}, 2000)
		})
	}

	@Cron('0 17 * * *')
	async handleAdminOrdersReminder() {
		const todayStart = new Date()
		todayStart.setHours(0, 0, 0, 0)

		const [payedCount, readyCount] = await Promise.all([
			this.prisma.order.count({
				where: { status: 'payed', createdAt: { gte: todayStart } }
			}),
			this.prisma.order.count({
				where: { status: 'ready_to_receive', createdAt: { gte: todayStart } }
			})
		])

		const total = payedCount + readyCount
		if (total === 0) return

		const parts: string[] = []
		if (payedCount > 0)
			parts.push(`${payedCount} оплачен${payedCount < 5 ? 'о' : 'о'}`)
		if (readyCount > 0)
			parts.push(`${readyCount} готов${readyCount === 1 ? 'о' : 'о'} к выдаче`)

		const body = `За сегодня: ${parts.join(
			', '
		)} — не забудьте обновить статусы.`

		await this.notifications.sendPushNotificationToAdmins(
			`📋 ${total} заказ${
				total === 1 ? '' : total < 5 ? 'а' : 'ов'
			} за сегодня`,
			body,
			{ adminOrdersReminder: true }
		)
	}

	@Cron('0 6 * * *')
	async handleBirthdayNotifications() {
		const now = new Date()
		const todayMonth = now.getUTCMonth() + 1
		const todayDay = now.getUTCDate()

		const in3 = new Date(now)
		in3.setUTCDate(in3.getUTCDate() + 3)
		const in3Month = in3.getUTCMonth() + 1
		const in3Day = in3.getUTCDate()

		const users = await this.prisma.user.findMany({
			where: { dateOfBirth: { not: null }, pushToken: { not: null } },
			select: { id: true, dateOfBirth: true, name: true }
		})

		for (const user of users) {
			const birth = new Date(user.dateOfBirth!)
			const bMonth = birth.getUTCMonth() + 1
			const bDay = birth.getUTCDate()
			const firstName = user.name ? `, ${user.name}` : ''

			if (bMonth === todayMonth && bDay === todayDay) {
				const notification = await this.notifications.saveNotification(
					user.id,
					`🎉 С днём рождения${firstName}!`,
					'Скидка 20% уже активна — заказывайте в течение 7 дней.',
					{ birthdayDiscount: true }
				)
				this.notifications
					.sendPushNotificationToUser(
						user.id,
						`🎉 С днём рождения${firstName}!`,
						'Скидка 20% уже активна — заказывайте в течение 7 дней.',
						{ birthdayDiscount: true, notificationId: notification.id }
					)
					.catch(() => {})
			} else if (bMonth === in3Month && bDay === in3Day) {
				const notification = await this.notifications.saveNotification(
					user.id,
					`🎂 Скоро день рождения${firstName}!`,
					'Через 3 дня вас ждёт скидка 20% на все заказы — действует весь ДР и 7 дней после.',
					{ birthdayReminder: true }
				)
				this.notifications
					.sendPushNotificationToUser(
						user.id,
						`🎂 Скоро день рождения${firstName}!`,
						'Через 3 дня вас ждёт скидка 20% на все заказы — действует весь ДР и 7 дней после.',
						{ birthdayReminder: true, notificationId: notification.id }
					)
					.catch(() => {})
			}
		}
	}

	@Cron('0 3 * * *')
	async handleCleanupOldNotifications() {
		const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
		await this.prisma.notification.deleteMany({
			where: { createdAt: { lt: cutoff } }
		})
	}

	// Брошенная корзина: каждый час проверяем пользователей с непустой корзиной
	@Cron('0 * * * *')
	async handleAbandonedCart() {
		const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)
		const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

		// Пользователи у которых есть товары в корзине
		const cartsWithItems = await this.prisma.cartItem.groupBy({
			by: ['userId'],
			_count: { productId: true }
		})
		const userIdsWithCart = cartsWithItems
			.filter(c => c._count.productId > 0)
			.map(c => c.userId)
		if (!userIdsWithCart.length) return

		// Исключаем тех, кто оформил заказ за последние 4 часа
		const recentOrders = await this.prisma.order.findMany({
			where: { userId: { in: userIdsWithCart }, createdAt: { gte: fourHoursAgo } },
			select: { userId: true }
		})
		const recentBuyerIds = new Set(recentOrders.map(o => o.userId).filter(Boolean))

		// Исключаем тех, кому уже отправляли за последние 24 часа
		const recentNotifs = await this.prisma.notification.findMany({
			where: {
				userId: { in: userIdsWithCart },
				createdAt: { gte: oneDayAgo },
				data: { path: ['abandonedCart'], equals: true }
			},
			select: { userId: true }
		})
		const alreadyNotifiedIds = new Set(recentNotifs.map(n => n.userId))

		// Фильтруем финальный список
		const targets = await this.prisma.user.findMany({
			where: {
				id: {
					in: userIdsWithCart.filter(
						id => !recentBuyerIds.has(id) && !alreadyNotifiedIds.has(id)
					)
				},
				pushToken: { not: null }
			},
			select: { id: true, name: true }
		})

		for (const user of targets) {
			const firstName = user.name ? `, ${user.name}` : ''
			const notification = await this.notifications.saveNotification(
				user.id,
				`🛒 Забыли что-то${firstName}?`,
				'У вас остались товары в корзине — оформите заказ, пока они не закончились!',
				{ abandonedCart: true, screen: 'Cart' }
			)
			this.notifications
				.sendPushNotificationToUser(
					user.id,
					`🛒 Забыли что-то${firstName}?`,
					'У вас остались товары в корзине — оформите заказ, пока они не закончились!',
					{ abandonedCart: true, screen: 'Cart', notificationId: notification.id }
				)
				.catch(() => {})
		}
	}

	// Запланированные рассылки: каждую минуту проверяем очередь
	@Cron('* * * * *')
	async handleScheduledBroadcasts() {
		const now = new Date()
		const due = await this.prisma.scheduledBroadcast.findMany({
			where: { scheduledAt: { lte: now }, sentAt: null }
		})
		for (const broadcast of due) {
			try {
				const meta = (broadcast.data as any) ?? {}
				await this.notifications.sendAdminBroadcast(
					broadcast.title,
					broadcast.body,
					meta,
					(broadcast.segment as any) ?? 'all',
					meta.categorySlug,
					meta.frequencyDays
				)
				await this.prisma.scheduledBroadcast.update({
					where: { id: broadcast.id },
					data: { sentAt: now }
				})
			} catch {}
		}
	}

	// 10-го числа каждого месяца в 12:00
	@Cron('0 12 10 * *')
	async handleLoyaltyLevelReminders() {
		const allLevels = await this.prisma.loyaltyLevel.findMany({
			orderBy: { minAmount: 'asc' }
		})
		if (allLevels.length === 0) return

		const maxMinAmount = Math.max(...allLevels.map(l => l.minAmount))
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

		const usersWithLoyalty = await this.prisma.userLoyalty.findMany({
			where: { totalAmountSpent: { lt: maxMinAmount } },
			include: { user: { select: { id: true, pushToken: true } } }
		})

		for (const userLoyalty of usersWithLoyalty) {
			if (!userLoyalty.user.pushToken) continue

			// Только активные пользователи — хоть один заказ за 90 дней
			const recentOrder = await this.prisma.order.findFirst({
				where: {
					userId: userLoyalty.userId,
					status: { not: 'cancelled' },
					createdAt: { gte: ninetyDaysAgo }
				}
			})
			if (!recentOrder) continue

			// Следующий уровень
			const nextLevel = allLevels.find(
				l => l.minAmount > userLoyalty.totalAmountSpent
			)
			if (!nextLevel) continue

			// Только если осталось меньше 30% порога следующего уровня
			const remaining = nextLevel.minAmount - userLoyalty.totalAmountSpent
			if (remaining > nextLevel.minAmount * 0.3) continue

			// Не слать если уровень только что повышался (меньше месяца назад)
			if (userLoyalty.updatedAt >= thirtyDaysAgo) continue

			// Не слать чаще раза в месяц — проверяем историю уведомлений
			const recentReminder = await this.prisma.notification.findFirst({
				where: {
					userId: userLoyalty.userId,
					createdAt: { gte: thirtyDaysAgo },
					data: { path: ['loyaltyReminder'], equals: true }
				}
			})
			if (recentReminder) continue

			const remainingFormatted = remaining.toLocaleString('ru-RU')
			const title = `🎯 До уровня «${nextLevel.name}» осталось немного!`
			const body = `Ещё ${remainingFormatted} ₽ в заказах — и ваша скидка вырастет до ${nextLevel.discount}%.`

			const notification = await this.notifications.saveNotification(
				userLoyalty.userId,
				title,
				body,
				{ loyaltyReminder: true, discount: true }
			)
			this.notifications
				.sendPushNotificationToUser(userLoyalty.userId, title, body, {
					loyaltyReminder: true,
					discount: true,
					notificationId: notification.id
				})
				.catch(() => {})
		}
	}
}
