import { Injectable } from '@nestjs/common'
import { Expo, ExpoPushMessage } from 'expo-server-sdk'
import { PrismaService } from 'src/prisma.service'

@Injectable()
export class ChatService {
	private expo = new Expo()

	constructor(private prisma: PrismaService) {}

	async getOrCreateRoom(userId: string) {
		return this.prisma.chatRoom.upsert({
			where: { userId },
			create: { userId },
			update: {}
		})
	}

	async saveMessage(roomId: string, senderId: string | null, text: string, isAdmin: boolean) {
		return this.prisma.chatMessage.create({
			data: { roomId, senderId, text, isAdmin }
		})
	}

	async getHistory(roomId: string, skip = 0, take = 50) {
		return this.prisma.chatMessage.findMany({
			where: { roomId },
			orderBy: { createdAt: 'desc' },
			skip,
			take
		})
	}

	async markAsRead(roomId: string, isAdmin: boolean) {
		await this.prisma.chatMessage.updateMany({
			where: { roomId, isAdmin: !isAdmin, isRead: false },
			data: { isRead: true }
		})
	}

	async getAllRooms() {
		return this.prisma.chatRoom.findMany({
			where: {
				user: { role: 'user' }
			},
			orderBy: { updatedAt: 'desc' },
			include: {
				user: { select: { id: true, email: true, name: true, displayName: true, avatarPath: true } },
				messages: {
					orderBy: { createdAt: 'desc' },
					take: 1
				}
			}
		})
	}

	async sendPushToAdmins(
		title: string,
		body: string,
		excludeUserId?: string,
		roomData?: { roomId: string; userName: string }
	) {
		const admins = await this.prisma.user.findMany({
			where: {
				role: { in: ['admin', 'manager'] },
				pushToken: { not: '' },
				...(excludeUserId ? { id: { not: excludeUserId } } : {})
			},
			select: { pushToken: true }
		})
		const data = roomData
			? { screen: 'AdminChatRoom', roomId: roomData.roomId, userName: roomData.userName }
			: { screen: 'ChatsList' }
		const messages = admins
			.filter(a => a.pushToken && Expo.isExpoPushToken(a.pushToken))
			.map(a => ({
				to: a.pushToken!,
				sound: 'default' as const,
				title,
				body,
				data
			}))
		if (messages.length) {
			try { await this.expo.sendPushNotificationsAsync(messages) } catch {}
		}
	}

	async getUserDisplayName(userId: string): Promise<string> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { displayName: true, name: true, surname: true, email: true }
		})
		if (!user) return 'Пользователь'
		if (user.displayName) return user.displayName
		if (user.name) return user.surname ? `${user.name} ${user.surname}` : user.name
		return user.email ?? 'Пользователь'
	}

	async getUnreadCountForAdmin(roomId: string) {
		return this.prisma.chatMessage.count({
			where: { roomId, isAdmin: false, isRead: false }
		})
	}

	async sendPushToUser(userId: string, title: string, body: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { pushToken: true }
		})
		if (!user?.pushToken || !Expo.isExpoPushToken(user.pushToken)) return
		const message: ExpoPushMessage = {
			to: user.pushToken,
			sound: 'default',
			title,
			body,
			data: { screen: 'SupportChat' }
		}
		try {
			await this.expo.sendPushNotificationsAsync([message])
		} catch {}
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

	async touchRoom(roomId: string) {
		await this.prisma.chatRoom.update({
			where: { id: roomId },
			data: { updatedAt: new Date() }
		})
	}
}
