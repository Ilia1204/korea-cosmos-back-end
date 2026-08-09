import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { NotificationsService } from 'src/notifications/notifications.service'

@Injectable()
export class GroupChatService {
	constructor(
		private prisma: PrismaService,
		private notifications: NotificationsService
	) {}

	private senderSelect = {
		id: true,
		name: true,
		displayName: true,
		avatarPath: true,
		role: true,
		lastSeenAt: true
	}

	private messageInclude = {
		sender: { select: this.senderSelect },
		replyTo: {
			select: {
				id: true,
				text: true,
				imageUrls: true,
				deletedAt: true,
				sender: { select: { name: true, displayName: true } }
			}
		},
		reactions: {
			select: { id: true, userId: true, emoji: true }
		}
	}

	async getOrCreateDefaultRoom() {
		const existing = await this.prisma.groupChatRoom.findFirst()
		if (existing) return existing
		return this.prisma.groupChatRoom.create({ data: {} })
	}

	async isParticipant(roomId: string, userId: string): Promise<boolean> {
		const p = await this.prisma.groupChatParticipant.findUnique({
			where: { roomId_userId: { roomId, userId } }
		})
		return !!p
	}

	async addParticipant(roomId: string, userId: string) {
		return this.prisma.groupChatParticipant.upsert({
			where: { roomId_userId: { roomId, userId } },
			create: { roomId, userId },
			update: {}
		})
	}

	async removeParticipant(roomId: string, userId: string) {
		await this.prisma.groupChatParticipant.deleteMany({
			where: { roomId, userId }
		})
	}

	async listParticipants(roomId: string) {
		const participants = await this.prisma.groupChatParticipant.findMany({
			where: { roomId },
			include: { user: { select: this.senderSelect } }
		})
		return participants.map(p => p.user)
	}

	async getEligibleUsers(roomId: string) {
		const participants = await this.prisma.groupChatParticipant.findMany({
			where: { roomId },
			select: { userId: true }
		})
		const excludeIds = participants.map(p => p.userId)
		return this.prisma.user.findMany({
			where: { role: { in: ['admin', 'manager'] }, id: { notIn: excludeIds } },
			select: this.senderSelect
		})
	}

	async saveMessage(
		roomId: string,
		senderId: string,
		text: string,
		replyToId?: string,
		imageUrls?: string[],
		alsoReadByIds: string[] = []
	) {
		const readByIds = [...new Set([senderId, ...alsoReadByIds])]
		const now = new Date().toISOString()
		const readReceipts = Object.fromEntries(readByIds.map(id => [id, now]))
		return this.prisma.groupChatMessage.create({
			data: {
				roomId,
				senderId,
				text,
				replyToId,
				readByIds,
				readReceipts,
				...(imageUrls?.length ? { imageUrls } : {})
			},
			include: this.messageInclude
		})
	}

	async markRoomAsRead(
		roomId: string,
		userId: string
	): Promise<{ ids: string[]; readAt: string }> {
		const unread = await this.prisma.groupChatMessage.findMany({
			where: {
				roomId,
				senderId: { not: userId },
				NOT: { readByIds: { has: userId } }
			},
			select: { id: true, readReceipts: true }
		})
		if (unread.length === 0) return { ids: [], readAt: new Date().toISOString() }
		const readAt = new Date().toISOString()
		await this.prisma.$transaction(
			unread.map(m =>
				this.prisma.groupChatMessage.update({
					where: { id: m.id },
					data: {
						readByIds: { push: userId },
						readReceipts: {
							...((m.readReceipts as Record<string, string>) ?? {}),
							[userId]: readAt
						}
					}
				})
			)
		)
		return { ids: unread.map(m => m.id), readAt }
	}

	async toggleReaction(messageId: string, userId: string, emoji: string) {
		const existing = await this.prisma.groupChatMessageReaction.findUnique({
			where: { messageId_userId_emoji: { messageId, userId, emoji } }
		})
		if (existing) {
			await this.prisma.groupChatMessageReaction.delete({
				where: { messageId_userId_emoji: { messageId, userId, emoji } }
			})
		} else {
			await this.prisma.groupChatMessageReaction.create({
				data: { messageId, userId, emoji }
			})
		}
		return this.prisma.groupChatMessageReaction.findMany({
			where: { messageId },
			select: { id: true, userId: true, emoji: true }
		})
	}

	async getHistory(roomId: string, skip = 0, take = 50) {
		return this.prisma.groupChatMessage.findMany({
			where: { roomId },
			orderBy: { createdAt: 'desc' },
			skip,
			take,
			include: this.messageInclude
		})
	}

	async getMessage(messageId: string) {
		return this.prisma.groupChatMessage.findUnique({
			where: { id: messageId },
			include: this.messageInclude
		})
	}

	async editMessage(messageId: string, text: string) {
		return this.prisma.groupChatMessage.update({
			where: { id: messageId },
			data: { text, editedAt: new Date() },
			include: this.messageInclude
		})
	}

	async deleteMessage(messageId: string) {
		return this.prisma.groupChatMessage.update({
			where: { id: messageId },
			data: { deletedAt: new Date() }
		})
	}

	async searchMessages(roomId: string, query: string) {
		return this.prisma.groupChatMessage.findMany({
			where: {
				roomId,
				deletedAt: null,
				text: { contains: query, mode: 'insensitive' }
			},
			orderBy: { createdAt: 'desc' },
			take: 50,
			include: this.messageInclude
		})
	}

	async getLastMessage(roomId: string) {
		return this.prisma.groupChatMessage.findFirst({
			where: { roomId },
			orderBy: { createdAt: 'desc' },
			select: {
				text: true,
				imageUrls: true,
				createdAt: true,
				senderId: true,
				deletedAt: true,
				sender: { select: { name: true, displayName: true } }
			}
		})
	}

	async getUnreadCount(roomId: string, userId: string) {
		return this.prisma.groupChatMessage.count({
			where: {
				roomId,
				senderId: { not: userId },
				NOT: { readByIds: { has: userId } }
			}
		})
	}

	async getMuteStatus(roomId: string, userId: string): Promise<boolean> {
		const p = await this.prisma.groupChatParticipant.findUnique({
			where: { roomId_userId: { roomId, userId } }
		})
		return p?.isMuted ?? false
	}

	async toggleMute(roomId: string, userId: string): Promise<boolean> {
		const p = await this.prisma.groupChatParticipant.findUnique({
			where: { roomId_userId: { roomId, userId } }
		})
		if (!p) return false
		const updated = await this.prisma.groupChatParticipant.update({
			where: { roomId_userId: { roomId, userId } },
			data: { isMuted: !p.isMuted }
		})
		return updated.isMuted
	}

	async updateLastSeen(userId: string) {
		await this.prisma.user.update({
			where: { id: userId },
			data: { lastSeenAt: new Date() }
		})
	}

	async touchRoom(roomId: string) {
		await this.prisma.groupChatRoom.update({
			where: { id: roomId },
			data: { updatedAt: new Date() }
		})
	}

	async sendAddedToChatPush(userId: string, addedByUserId: string) {
		const addedBy = await this.prisma.user.findUnique({
			where: { id: addedByUserId },
			select: { name: true, displayName: true }
		})
		const addedByName = addedBy?.name || addedBy?.displayName || 'Администратор'
		const title = '💬 Командный чат'
		const body = `${addedByName} добавил(а) вас в командный чат`
		const data = { screen: 'TeamChat' }

		const notification = await this.notifications.saveNotification(
			userId,
			title,
			body,
			data
		)
		await this.notifications
			.sendPushNotificationToUser(userId, title, body, {
				...data,
				notificationId: notification.id
			})
			.catch(() => {})
	}

	async sendRemovedFromChatPush(userId: string, removedByUserId: string) {
		const removedBy = await this.prisma.user.findUnique({
			where: { id: removedByUserId },
			select: { name: true, displayName: true }
		})
		const removedByName =
			removedBy?.name || removedBy?.displayName || 'Администратор'
		const title = '💬 Командный чат'
		const body = `${removedByName} удалил(а) вас из командного чата`
		const data = { screen: 'TeamChat' }

		const notification = await this.notifications.saveNotification(
			userId,
			title,
			body,
			data
		)
		await this.notifications
			.sendPushNotificationToUser(userId, title, body, {
				...data,
				notificationId: notification.id
			})
			.catch(() => {})
	}

	async sendJoinedPushToParticipants(
		roomId: string,
		userId: string,
		actorUserId: string
	) {
		const joined = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { name: true, displayName: true, role: true }
		})
		if (!joined) return
		const joinedName = joined.name || joined.displayName || 'Менеджер'
		const roleLabel = joined.role === 'admin' ? 'администратора' : 'менеджера'

		const participants = await this.listParticipants(roomId)
		const targets = participants.filter(
			p => p.id !== userId && p.id !== actorUserId
		)
		await Promise.all(
			targets.map(p =>
				this.notifications
					.sendPushNotificationToUser(
						p.id,
						'👋 Новый участник',
						`${joinedName} присоединился(-ась) к командному чату в качестве ${roleLabel}`,
						{ screen: 'TeamChat' }
					)
					.catch(() => {})
			)
		)
	}

	async sendPushToParticipants(
		roomId: string,
		title: string,
		body: string,
		excludeUserId: string,
		onlineUserIds: string[]
	) {
		const participants = await this.prisma.groupChatParticipant.findMany({
			where: { roomId },
			select: { userId: true, isMuted: true }
		})
		const targets = participants.filter(
			p =>
				p.userId !== excludeUserId &&
				!onlineUserIds.includes(p.userId) &&
				!p.isMuted
		)
		await Promise.all(
			targets.map(p =>
				this.notifications
					.sendPushNotificationToUser(p.userId, title, body, {
						screen: 'TeamChat'
					})
					.catch(() => {})
			)
		)
	}
}
