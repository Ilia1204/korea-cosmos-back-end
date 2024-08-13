import { Injectable, NotFoundException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Expo, ExpoPushMessage } from 'expo-server-sdk'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { returnNotificationObject } from './return-notification.object'

@Injectable()
export class NotificationsService {
	private expo = new Expo()

	constructor(private prisma: PrismaService, private user: UserService) {}

	private static lastRunDate: Date = new Date(0)

	async saveNotification(
		userId: string,
		title: string,
		body: string,
		data?: object
	) {
		return this.prisma.notification.create({
			data: {
				title,
				body,
				data,
				userId
			}
		})
	}

	async sendPushNotificationToAdmins(
		title: string,
		message: string,
		data?: object
	) {
		const admins = await this.prisma.user.findMany({
			where: { isAdmin: true }
		})

		const messages: ExpoPushMessage[] = admins
			.filter(admin => admin.pushToken)
			.map(admin => ({
				to: admin.pushToken,
				sound: 'default',
				title,
				body: message,
				data
			}))

		const chunks = this.expo.chunkPushNotifications(messages)
		const tickets = []

		for (const chunk of chunks) {
			try {
				const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk)
				tickets.push(...ticketChunk)
			} catch (error) {
				console.error(error)
				if (error.details?.error === 'DeviceNotRegistered') {
					await this.prisma.user.updateMany({
						where: { pushToken: error.details.expoPushToken },
						data: { pushToken: null }
					})
				}
			}
		}

		await Promise.all(
			admins.map(admin => {
				this.saveNotification(admin.id, title, message, data)
			})
		)

		return tickets
	}

	async sendPushNotificationToUser(
		userId: string,
		title: string,
		message: string,
		data: any
	) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId }
		})

		if (user?.pushToken) {
			const messages: ExpoPushMessage = {
				to: user.pushToken,
				sound: 'default',
				title,
				body: message,
				data
			}

			try {
				const ticketChunk = await this.expo.sendPushNotificationsAsync([
					messages
				])

				if (
					ticketChunk[0].status === 'error' &&
					ticketChunk[0].details?.error === 'DeviceNotRegistered'
				) {
					await this.prisma.user.update({
						where: { id: userId },
						data: { pushToken: null }
					})
				}
			} catch (error) {
				console.error(error)
			}
		}
	}

	async getNotificationsForUser(userId: string) {
		const user = await this.user.getById(userId)

		if (!user) throw new NotFoundException('Пользователь не найден')

		return this.prisma.notification.findMany({
			where: { userId: user.id },
			orderBy: { createdAt: 'desc' },
			select: {
				...returnNotificationObject
			}
		})
	}

	async getById(id: string) {
		const notification = await this.prisma.notification.findUnique({
			where: { id },
			select: returnNotificationObject
		})

		if (!notification) throw new NotFoundException('Уведомление не найдено')

		return notification
	}

	async notifyUsersAboutProductInStock(productId: string) {
		const product = await this.prisma.product.findUnique({
			where: { id: productId }
		})

		if (!product || !product.inStock) return

		const users = await this.prisma.user.findMany({
			where: {
				favorites: {
					some: {
						id: productId
					}
				}
			}
		})

		users.forEach(user => {
			setTimeout(() => {
				this.sendPushNotificationToUser(
					user.id,
					'📦 Товар в наличии!',
					'Товар, который вы добавили в избранное, снова в наличии. Посмотрите его!',
					{ productSlug: product.slug }
				)
			}, 2000)

			this.saveNotification(
				user.id,
				'📦 Товар в наличии!',
				'Товар, который вы добавили в избранное, снова в наличии. Посмотрите его!',
				{ productSlug: product.slug }
			)
		})
	}

	@Cron('0 15 * * *')
	async handleProfileReminder() {
		const now = new Date()

		if (this.isFiveDaysPassed(NotificationsService.lastRunDate, now)) {
			const users = await this.prisma.user.findMany({
				where: {
					OR: [
						{ name: '' },
						{ surname: '' },
						{ phone: '' },
						{ region: '' },
						{ city: '' },
						{ postCode: '' },
						{ street: '' },
						{ house: '' },
						{ apartment: '' }
					]
				}
			})

			users.forEach(user => {
				this.sendPushNotificationToUser(
					user.id,
					'🙎🏻‍♂️ Заполните свой профиль',
					'Некоторые поля в вашем профиле не заполнены. Пожалуйста, обновите информацию.',
					{ editProfileNavigate: 'EditProfile' }
				)

				this.saveNotification(
					user.id,
					'🙎🏻‍♂️ Заполните свой профиль',
					'Некоторые поля в вашем профиле не заполнены. Пожалуйста, обновите информацию.',
					{ editProfileNavigate: 'EditProfile' }
				)
			})

			NotificationsService.lastRunDate = now
		}
	}

	private isFiveDaysPassed(lastRunDate: Date, currentDate: Date): boolean {
		if (!lastRunDate) return true

		const diffTime = Math.abs(currentDate.getTime() - lastRunDate.getTime())
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

		return diffDays >= 5
	}

	async clearNotifications(userId: string) {
		const user = await this.user.getById(userId)
		if (!user) throw new NotFoundException('Пользователь не найден')

		await this.prisma.notification.deleteMany({
			where: { userId }
		})

		return {
			message: 'Все уведомления удалены'
		}
	}

	async delete(id: string, userId: string) {
		const notification = await this.getById(id)
		if (!notification) throw new NotFoundException('Уведомление не найдено')

		return this.prisma.notification.delete({
			where: { id, userId }
		})
	}

	async savePushToken(id: string, token: string) {
		const user = await this.user.getById(id)
		if (!user) throw new NotFoundException('Пользователь не найден')

		return this.prisma.user.update({
			where: { id: user.id },
			data: { pushToken: token }
		})
	}
}
