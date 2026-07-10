import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { NotificationsService } from 'src/notifications/notifications.service'

@Injectable()
export class ChatService {
	constructor(
		private prisma: PrismaService,
		private notifications: NotificationsService
	) {}

	async getOrCreateRoom(userId: string) {
		return this.prisma.chatRoom.upsert({
			where: { userId },
			create: { userId },
			update: {}
		})
	}

	async getRoomStatus(roomId: string): Promise<string> {
		const room = await this.prisma.chatRoom.findUnique({
			where: { id: roomId },
			select: { status: true }
		})
		return room?.status ?? 'open'
	}

	async closeRoom(roomId: string) {
		return this.prisma.chatRoom.update({
			where: { id: roomId },
			data: { status: 'closed' }
		})
	}

	async reopenRoom(roomId: string) {
		return this.prisma.chatRoom.update({
			where: { id: roomId },
			data: { status: 'open' }
		})
	}

	private senderSelect = {
		id: true,
		name: true,
		displayName: true,
		avatarPath: true,
		role: true
	}

	private messageInclude = {
		sender: { select: this.senderSelect },
		replyTo: {
			select: {
				id: true,
				text: true,
				imageUrls: true,
				deletedAt: true,
				isAdmin: true,
				sender: { select: { name: true, displayName: true } }
			}
		},
		reactions: {
			select: { id: true, userId: true, emoji: true }
		}
	}

	async saveMessage(
		roomId: string,
		senderId: string | null,
		text: string,
		isAdmin: boolean,
		replyToId?: string,
		imageUrls?: string[]
	) {
		return this.prisma.chatMessage.create({
			data: {
				roomId,
				senderId,
				text,
				isAdmin,
				replyToId,
				...(imageUrls?.length ? { imageUrls } : {})
			},
			include: this.messageInclude
		})
	}

	async getHistory(roomId: string, skip = 0, take = 50) {
		return this.prisma.chatMessage.findMany({
			where: { roomId },
			orderBy: { createdAt: 'desc' },
			skip,
			take,
			include: this.messageInclude
		})
	}

	async editMessage(messageId: string, text: string) {
		return this.prisma.chatMessage.update({
			where: { id: messageId },
			data: { text, editedAt: new Date() },
			include: this.messageInclude
		})
	}

	async deleteMessage(messageId: string) {
		return this.prisma.chatMessage.update({
			where: { id: messageId },
			data: { deletedAt: new Date() }
		})
	}

	async restoreMessage(messageId: string) {
		return this.prisma.chatMessage.update({
			where: { id: messageId },
			data: { deletedAt: null },
			include: this.messageInclude
		})
	}

	async getMessage(messageId: string) {
		return this.prisma.chatMessage.findUnique({
			where: { id: messageId },
			include: this.messageInclude
		})
	}

	async markAsRead(roomId: string, isAdmin: boolean) {
		await this.prisma.chatMessage.updateMany({
			where: { roomId, isAdmin: !isAdmin, isRead: false },
			data: { isRead: true }
		})
	}

	async markAsReadAndGetIds(
		roomId: string,
		isAdmin: boolean
	): Promise<string[]> {
		const msgs = await this.prisma.chatMessage.findMany({
			where: { roomId, isAdmin: !isAdmin, isRead: false },
			select: { id: true }
		})
		if (msgs.length === 0) return []
		await this.prisma.chatMessage.updateMany({
			where: { roomId, isAdmin: !isAdmin, isRead: false },
			data: { isRead: true }
		})
		return msgs.map(m => m.id)
	}

	async markMessageAsRead(messageId: string): Promise<void> {
		await this.prisma.chatMessage.update({
			where: { id: messageId },
			data: { isRead: true }
		})
	}

	async getAllRooms() {
		const rooms = await this.prisma.chatRoom.findMany({
			where: { user: { role: 'user' } },
			orderBy: { updatedAt: 'desc' },
			include: {
				user: {
					select: {
						id: true,
						email: true,
						name: true,
						displayName: true,
						avatarPath: true
					}
				},
				messages: {
					orderBy: { createdAt: 'desc' },
					take: 1
				},
				_count: {
					select: { messages: { where: { isAdmin: false, isRead: false } } }
				}
			}
		})
		return rooms.map(r => ({
			...r,
			lastMessage: r.messages[0] ?? null,
			unreadCount: r._count.messages
		}))
	}

	async sendPushToAdmins(
		title: string,
		body: string,
		excludeUserId?: string,
		roomData?: { roomId: string; userName: string }
	) {
		const mutedByIds = roomData ? await this.getMutedByIds(roomData.roomId) : []
		const admins = await this.prisma.user.findMany({
			where: {
				role: { in: ['admin', 'manager'] },
				...(excludeUserId ? { id: { not: excludeUserId } } : {})
			},
			select: { id: true }
		})
		const data = roomData
			? {
					screen: 'AdminChatRoom',
					params: { roomId: roomData.roomId, userName: roomData.userName }
			  }
			: { screen: 'ChatsList' }
		await Promise.all(
			admins
				.filter(a => !mutedByIds.includes(a.id))
				.map(admin =>
					this.notifications
						.sendPushNotificationToUser(admin.id, title, body, data)
						.catch(() => {})
				)
		)
	}

	async getUserDisplayName(userId: string): Promise<string> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { displayName: true, name: true, surname: true, email: true }
		})
		if (!user) return 'Пользователь'
		if (user.displayName) return user.displayName
		if (user.name)
			return user.surname ? `${user.name} ${user.surname}` : user.name
		return user.email ?? 'Пользователь'
	}

	async getUnreadCountForAdmin(roomId: string) {
		return this.prisma.chatMessage.count({
			where: { roomId, isAdmin: false, isRead: false }
		})
	}

	async getUnreadRoomsCount(): Promise<number> {
		const rooms = await this.prisma.chatRoom.findMany({
			where: {
				user: { role: 'user' },
				messages: { some: { isAdmin: false, isRead: false } }
			},
			select: { id: true }
		})
		return rooms.length
	}

	async sendPushToUser(userId: string, title: string, body: string) {
		const data = { screen: 'SupportChat' }
		this.notifications
			.sendPushNotificationToUser(userId, title, body, data)
			.catch(() => {})
	}

	async getRoomByUserId(userId: string) {
		return this.prisma.chatRoom.findUnique({ where: { userId } })
	}

	async getUserRole(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { role: true }
		})
		return user?.role ?? null
	}

	async updateLastSeen(userId: string) {
		await this.prisma.user.update({
			where: { id: userId },
			data: { lastSeenAt: new Date() }
		})
	}

	async getLastAdminSenderInRoom(roomId: string): Promise<string | null> {
		const msg = await this.prisma.chatMessage.findFirst({
			where: { roomId, isAdmin: true, senderId: { not: null } },
			orderBy: { createdAt: 'desc' },
			select: { senderId: true }
		})
		return msg?.senderId ?? null
	}

	async getLastSeen(userId: string): Promise<Date | null> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { lastSeenAt: true }
		})
		return user?.lastSeenAt ?? null
	}

	async getRoomFromId(roomId: string) {
		return this.prisma.chatRoom.findUnique({ where: { id: roomId } })
	}

	async toggleReaction(messageId: string, userId: string, emoji: string) {
		const existing = await this.prisma.chatMessageReaction.findUnique({
			where: { messageId_userId_emoji: { messageId, userId, emoji } }
		})
		if (existing) {
			await this.prisma.chatMessageReaction.delete({
				where: { messageId_userId_emoji: { messageId, userId, emoji } }
			})
		} else {
			await this.prisma.chatMessageReaction.create({
				data: { messageId, userId, emoji }
			})
		}
		return this.prisma.chatMessageReaction.findMany({
			where: { messageId },
			select: { id: true, userId: true, emoji: true }
		})
	}

	async getMessageCount(roomId: string): Promise<number> {
		return this.prisma.chatMessage.count({ where: { roomId } })
	}

	async touchRoom(roomId: string) {
		await this.prisma.chatRoom.update({
			where: { id: roomId },
			data: { updatedAt: new Date() }
		})
	}

	async deleteRoom(roomId: string) {
		await this.prisma.chatRoom.delete({ where: { id: roomId } })
	}

	async toggleMute(roomId: string, adminId: string): Promise<boolean> {
		const room = await this.prisma.chatRoom.findUnique({
			where: { id: roomId },
			select: { mutedByIds: true }
		})
		if (!room) return false
		const isMuted = room.mutedByIds.includes(adminId)
		await this.prisma.chatRoom.update({
			where: { id: roomId },
			data: {
				mutedByIds: isMuted
					? { set: room.mutedByIds.filter(id => id !== adminId) }
					: { push: adminId }
			}
		})
		return !isMuted
	}

	async getMutedByIds(roomId: string): Promise<string[]> {
		const room = await this.prisma.chatRoom.findUnique({
			where: { id: roomId },
			select: { mutedByIds: true }
		})
		return room?.mutedByIds ?? []
	}
}
