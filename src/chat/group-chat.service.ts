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
		return this.prisma.groupChatMessage.create({
			data: {
				roomId,
				senderId,
				text,
				replyToId,
				readByIds: [...new Set([senderId, ...alsoReadByIds])],
				...(imageUrls?.length ? { imageUrls } : {})
			},
			include: this.messageInclude
		})
	}

	async markRoomAsRead(roomId: string, userId: string): Promise<string[]> {
		const unread = await this.prisma.groupChatMessage.findMany({
			where: {
				roomId,
				senderId: { not: userId },
				NOT: { readByIds: { has: userId } }
			},
			select: { id: true }
		})
		if (unread.length === 0) return []
		await this.prisma.$transaction(
			unread.map(m =>
				this.prisma.groupChatMessage.update({
					where: { id: m.id },
					data: { readByIds: { push: userId } }
				})
			)
		)
		return unread.map(m => m.id)
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

	async touchRoom(roomId: string) {
		await this.prisma.groupChatRoom.update({
			where: { id: roomId },
			data: { updatedAt: new Date() }
		})
	}

	async sendPushToParticipants(
		roomId: string,
		title: string,
		body: string,
		excludeUserId: string,
		onlineUserIds: string[]
	) {
		const participants = await this.listParticipants(roomId)
		const targets = participants.filter(
			p => p.id !== excludeUserId && !onlineUserIds.includes(p.id)
		)
		await Promise.all(
			targets.map(p =>
				this.notifications
					.sendPushNotificationToUser(p.id, title, body, {
						screen: 'TeamChat'
					})
					.catch(() => {})
			)
		)
	}
}
