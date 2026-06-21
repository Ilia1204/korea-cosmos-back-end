import { Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Expo, ExpoPushMessage } from 'expo-server-sdk'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { returnNotificationObject } from './return-notification.object'

@Injectable()
export class NotificationsService {
	private expo = new Expo()
	constructor(private prisma: PrismaService, private user: UserService) {}

	async saveNotification(
		userId: string,
		title: string,
		body: string,
		data?: object
	) {
		return this.prisma.notification.create({
			data: { title, body, data, userId }
		})
	}

	async sendBroadcast(title: string, body: string, data?: object) {
		const users = await this.prisma.user.findMany({
			where: { pushToken: { not: null } },
			select: { id: true, pushToken: true }
		})

		const messages: ExpoPushMessage[] = users
			.filter(u => Expo.isExpoPushToken(u.pushToken!))
			.map(u => ({ to: u.pushToken!, sound: 'default', title, body, data }))

		const chunks = this.expo.chunkPushNotifications(messages)
		for (const chunk of chunks) {
			try {
				const tickets = await this.expo.sendPushNotificationsAsync(chunk)
				for (let i = 0; i < tickets.length; i++) {
					if (
						tickets[i].status === 'error' &&
						(tickets[i] as any).details?.error === 'DeviceNotRegistered'
					) {
						await this.prisma.user.update({
							where: { id: users[i].id },
							data: { pushToken: null }
						})
					}
				}
			} catch {}
		}

		await this.prisma.notification.createMany({
			data: users.map(u => ({ userId: u.id, title, body, data: data ?? {} }))
		})
	}

	async sendPushNotificationToAdmins(
		title: string,
		message: string,
		data?: object
	) {
		const admins = await this.prisma.user.findMany({
			where: { role: { in: ['admin', 'manager'] } }
		})

		await Promise.all(
			admins.map(admin => {
				this.saveNotification(admin.id, title, message, data)
				if (admin.pushToken) {
					return this.sendPushNotificationToUser(admin.id, title, message, data)
				}
			})
		)
	}

	async sendPushNotificationToUser(
		userId: string,
		title: string,
		message: string,
		data: any
	) {
		const user = await this.prisma.user.findUnique({ where: { id: userId } })

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
			select: { ...returnNotificationObject }
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

	async notifyFavoriteUsersAboutPriceDrop(
		slug: string,
		name: string,
		newPrice: string,
		oldPrice: string
	) {
		const product = await this.prisma.product.findUnique({
			where: { slug },
			select: { id: true, newPrice: true }
		})
		if (!product) return

		const parsedNew = parseFloat(newPrice)
		const parsedOld = parseFloat(oldPrice)
		if (isNaN(parsedNew) || isNaN(parsedOld) || parsedNew >= parsedOld) return

		// Уже уведомляли об этой скидке?
		const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
		const users = await this.prisma.user.findMany({
			where: { favoriteIds: { has: product.id }, pushToken: { not: null } },
			select: { id: true }
		})
		if (!users.length) return

		const recentNotifs = await this.prisma.notification.findMany({
			where: {
				userId: { in: users.map(u => u.id) },
				createdAt: { gte: oneDayAgo },
				data: { path: ['priceDrop'], equals: true },
				title: { contains: name }
			},
			select: { userId: true }
		})
		const alreadyNotified = new Set(recentNotifs.map(n => n.userId))

		const title = `💸 Цена снизилась!`
		const body = `${name} — было ${Math.round(parsedOld)}₽, теперь ${Math.round(parsedNew)}₽ 🎉`
		const data = { priceDrop: true, productSlug: slug }

		for (const user of users) {
			if (alreadyNotified.has(user.id)) continue
			const notification = await this.saveNotification(user.id, title, body, data)
			this.sendPushNotificationToUser(user.id, title, body, {
				...data,
				notificationId: notification.id
			}).catch(() => {})
		}
	}

	async notifyUsersAboutProductInStock(productId: string) {
		const product = await this.prisma.product.findUnique({
			where: { id: productId }
		})

		if (!product || !product.inStock)
			throw new NotFoundException('Товар не найден')

		const users = await this.prisma.user.findMany({
			where: { favoriteIds: { has: productId } }
		})

		users.forEach(user => {
			setTimeout(() => {
				this.sendPushNotificationToUser(
					user.id,
					'📦 Товар в наличии!',
					'Товар, который вы добавили в избранное, снова в наличии. Посмотрите его!',
					{ productSlug: product.slug, isRead: true }
				).catch(() => {})
				this.saveNotification(
					user.id,
					'📦 Товар в наличии!',
					'Товар, который вы добавили в избранное, снова в наличии. Посмотрите его!',
					{ productSlug: product.slug }
				).catch(() => {})
			}, 2000)
		})
	}

	async notifySubscribedUsersAboutStock(productSlug: string) {
		const subscriptions = await this.prisma.productSubscriptions.findMany({
			where: { productId: productSlug, isNotified: false },
			include: { user: true }
		})

		for (const subscription of subscriptions) {
			const user = subscription.user

			await this.prisma.productSubscriptions.delete({
				where: { userId_productId: { userId: user.id, productId: productSlug } }
			})

			setTimeout(() => {
				this.sendPushNotificationToUser(
					user.id,
					'🎉 Товар снова в наличии!',
					'Товар, на который вы подписались, появился в наличии. Заходите, пока не разобрали!',
					{ productSlug, isRead: true }
				).catch(() => {})
				this.saveNotification(
					user.id,
					'🎉 Товар снова в наличии!',
					'Товар, на который вы подписались, появился в наличии. Заходите, пока не разобрали!',
					{ productSlug }
				).catch(() => {})
			}, 2000)
		}
	}

	async markAsRead(notificationId: string) {
		await this.getById(notificationId)

		await this.prisma.notification.update({
			where: { id: notificationId },
			data: { isRead: true }
		})
	}

	async markAllAsRead(userId: string) {
		await this.prisma.notification.updateMany({
			where: { userId, isRead: false },
			data: { isRead: true }
		})
	}

	async getSubscribedProducts(userId: string) {
		const subs = await this.prisma.productSubscriptions.findMany({
			where: { userId },
			select: { productId: true },
			orderBy: { createdAt: 'desc' }
		})
		return subs.map(s => s.productId).filter(id => isNaN(Number(id)))
	}

	async unsubscribeFromProduct(userId: string, productSlug: string) {
		await this.prisma.productSubscriptions.deleteMany({
			where: { userId, productId: productSlug }
		})
	}

	async subscribeToProductStockNotification(
		userId: string,
		productSlug: string
	) {
		const subscriptionExists =
			await this.prisma.productSubscriptions.findUnique({
				where: { userId_productId: { userId, productId: productSlug } }
			})

		if (!subscriptionExists)
			await this.prisma.productSubscriptions.create({
				data: { userId, productId: productSlug, isNotified: false }
			})
	}

	async clearNotifications(userId: string) {
		const user = await this.user.getById(userId)
		if (!user) throw new NotFoundException('Пользователь не найден')

		await this.prisma.notification.deleteMany({ where: { userId } })

		return { message: 'Все уведомления удалены' }
	}

	async delete(id: string, userId: string) {
		await this.getById(id)

		return this.prisma.notification.delete({ where: { id, userId } })
	}

	async savePushToken(id: string, token: string) {
		const user = await this.user.getById(id)
		if (!user) throw new NotFoundException('Пользователь не найден')

		return this.prisma.user.update({
			where: { id: user.id },
			data: { pushToken: token }
		})
	}

	async clearPushToken(id: string) {
		return this.prisma.user.update({
			where: { id },
			data: { pushToken: null }
		})
	}

	async sendAdminBroadcast(
		title: string,
		body: string,
		data?: object,
		segment: 'all' | 'active' | 'inactive' | 'new_users' | 'category' = 'all',
		categorySlug?: string,
		frequencyDays?: number
	) {
		const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
		let targets: { id: string; pushToken: string | null }[] = []

		if (segment === 'all') {
			targets = await this.prisma.user.findMany({
				where: { pushToken: { not: null } },
				select: { id: true, pushToken: true }
			})
		} else if (segment === 'active') {
			const orders = await this.prisma.order.findMany({
				where: { status: { not: 'cancelled' }, createdAt: { gte: cutoff90 } },
				select: { userId: true },
				distinct: ['userId']
			})
			const userIds = orders.map(o => o.userId).filter(Boolean) as string[]
			targets = await this.prisma.user.findMany({
				where: { id: { in: userIds }, pushToken: { not: null } },
				select: { id: true, pushToken: true }
			})
		} else if (segment === 'inactive') {
			const recentUserIds = (await this.prisma.order.findMany({
				where: { createdAt: { gte: cutoff90 } },
				select: { userId: true },
				distinct: ['userId']
			})).map(o => o.userId).filter(Boolean) as string[]

			const anyOrderUserIds = (await this.prisma.order.findMany({
				select: { userId: true },
				distinct: ['userId']
			})).map(o => o.userId).filter(Boolean) as string[]

			const inactiveIds = anyOrderUserIds.filter(id => !recentUserIds.includes(id))
			targets = await this.prisma.user.findMany({
				where: { id: { in: inactiveIds }, pushToken: { not: null } },
				select: { id: true, pushToken: true }
			})
		} else if (segment === 'new_users') {
			const withOrderIds = (await this.prisma.order.findMany({
				select: { userId: true },
				distinct: ['userId']
			})).map(o => o.userId).filter(Boolean) as string[]

			targets = await this.prisma.user.findMany({
				where: { id: { notIn: withOrderIds }, pushToken: { not: null } },
				select: { id: true, pushToken: true }
			})
		} else if (segment === 'category' && categorySlug) {
			// Пользователи, которые покупали товар из данной категории
			const category = await this.prisma.category.findUnique({
				where: { slug: categorySlug },
				select: { products: { select: { id: true } } }
			})
			const productIds = category?.products.map(p => p.id) ?? []

			const orderUserIds = (await this.prisma.orderItem.findMany({
				where: { productId: { in: productIds } },
				select: { order: { select: { userId: true } } },
				distinct: ['productId']
			})).map(i => i.order?.userId).filter(Boolean) as string[]

			const uniqueIds = [...new Set(orderUserIds)]
			targets = await this.prisma.user.findMany({
				where: { id: { in: uniqueIds }, pushToken: { not: null } },
				select: { id: true, pushToken: true }
			})
		}

		// Фильтр по частоте: пропускаем тех, кто уже получал broadcast за последние N дней
		if (frequencyDays && frequencyDays > 0) {
			const cutoffFreq = new Date(Date.now() - frequencyDays * 24 * 60 * 60 * 1000)
			const recentReceivers = await this.prisma.notification.findMany({
				where: {
					userId: { in: targets.map(t => t.id) },
					createdAt: { gte: cutoffFreq },
					data: { path: ['adminBroadcast'], equals: true }
				},
				select: { userId: true },
				distinct: ['userId']
			})
			const recentIds = new Set(recentReceivers.map(r => r.userId))
			targets = targets.filter(t => !recentIds.has(t.id))
		}

		const broadcastId = randomUUID()
		let sent = 0
		for (const user of targets) {
			const notification = await this.saveNotification(
				user.id, title, body,
				{ ...(data ?? {}), adminBroadcast: true, broadcastId }
			)
			await this.prisma.notification.update({
				where: { id: notification.id },
				data: { broadcastId }
			})
			this.sendPushNotificationToUser(
				user.id, title, body,
				{ ...(data ?? {}), adminBroadcast: true, broadcastId, notificationId: notification.id }
			).catch(() => {})
			sent++
		}
		return { ok: true, sent, broadcastId }
	}

	async tapNotification(id: string) {
		await this.prisma.notification.update({
			where: { id },
			data: { tappedAt: new Date(), isRead: true }
		})
	}

	async getAdminAnalytics() {
		const groups = await this.prisma.notification.groupBy({
			by: ['broadcastId'],
			where: { broadcastId: { not: null } },
			_count: { id: true },
			orderBy: { _count: { id: 'desc' } },
			take: 30
		})

		const results = await Promise.all(
			groups.map(async g => {
				const broadcastId = g.broadcastId!
				const [sample, tappedCount] = await Promise.all([
					this.prisma.notification.findFirst({
						where: { broadcastId },
						select: { title: true, body: true, createdAt: true, data: true }
					}),
					this.prisma.notification.count({
						where: { broadcastId, tappedAt: { not: null } }
					})
				])
				if (!sample) return null

				const sentAt = sample.createdAt
				const cutoff = new Date(sentAt.getTime() + 48 * 60 * 60 * 1000)
				const userIds = (await this.prisma.notification.findMany({
					where: { broadcastId },
					select: { userId: true }
				})).map(n => n.userId)

				const conversions = await this.prisma.order.count({
					where: {
						userId: { in: userIds },
						status: { not: 'cancelled' },
						createdAt: { gte: sentAt, lte: cutoff }
					}
				})

				const sent = g._count.id
				return {
					broadcastId,
					title: sample.title,
					body: sample.body,
					sentAt: sample.createdAt,
					segment: (sample.data as any)?.segment ?? 'all',
					sent,
					tapped: tappedCount,
					tapRate: sent > 0 ? Math.round((tappedCount / sent) * 100) : 0,
					conversions,
					conversionRate: sent > 0 ? Math.round((conversions / sent) * 100) : 0
				}
			})
		)

		return results.filter(Boolean)
	}

	async getAdminBroadcastHistory(adminUserId: string) {
		return this.prisma.notification.findMany({
			where: { userId: adminUserId },
			orderBy: { createdAt: 'desc' },
			take: 30,
			select: { id: true, title: true, body: true, data: true, createdAt: true, isRead: true }
		})
	}

	async scheduleAdminBroadcast(dto: {
		title: string
		body: string
		scheduledAt: string
		segment?: string
		categorySlug?: string
		frequencyDays?: number
		data?: object
	}) {
		return this.prisma.scheduledBroadcast.create({
			data: {
				title: dto.title,
				body: dto.body,
				scheduledAt: new Date(dto.scheduledAt),
				segment: dto.segment ?? 'all',
				data: {
					...(dto.data ?? {}),
					categorySlug: dto.categorySlug,
					frequencyDays: dto.frequencyDays
				}
			}
		})
	}

	async getScheduledBroadcasts() {
		return this.prisma.scheduledBroadcast.findMany({
			where: { sentAt: null },
			orderBy: { scheduledAt: 'asc' }
		})
	}

	async deleteScheduledBroadcast(id: string) {
		return this.prisma.scheduledBroadcast.delete({ where: { id } })
	}
}
