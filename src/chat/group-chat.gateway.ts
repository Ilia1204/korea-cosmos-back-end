import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	MessageBody,
	ConnectedSocket,
	OnGatewayConnection,
	OnGatewayDisconnect
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { GroupChatService } from './group-chat.service'

interface AuthSocket extends Socket {
	userId?: string
}

interface SocketMeta {
	userId: string
	roomId: string
	isBackground: boolean
}

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/group-chat' })
export class GroupChatGateway
	implements OnGatewayConnection, OnGatewayDisconnect
{
	@WebSocketServer() server: Server

	// roomId → Set<socketId>
	private roomSockets = new Map<string, Set<string>>()
	// socketId → meta
	private socketMeta = new Map<string, SocketMeta>()

	constructor(private chat: GroupChatService, private jwt: JwtService) {}

	handleConnection(socket: AuthSocket) {
		try {
			const token = socket.handshake.auth?.token as string
			if (!token) {
				socket.disconnect()
				return
			}
			const payload = this.jwt.verify(token)
			socket.userId = payload.id
		} catch {
			socket.disconnect()
		}
	}

	handleDisconnect(socket: AuthSocket) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta) return
		this.roomSockets.get(meta.roomId)?.delete(socket.id)
		this.socketMeta.delete(socket.id)
		this.chat.updateLastSeen(meta.userId).catch(() => null)
		this.broadcastToRoom(meta.roomId, 'presence:left', {
			userId: meta.userId
		})
	}

	@SubscribeMessage('join')
	async handleJoin(@ConnectedSocket() socket: AuthSocket) {
		if (!socket.userId) {
			socket.emit('error', 'unauthorized')
			return
		}

		const room = await this.chat.getOrCreateDefaultRoom()
		const allowed = await this.chat.isParticipant(room.id, socket.userId)
		if (!allowed) {
			socket.emit('error', 'not a participant')
			return
		}

		if (!this.roomSockets.has(room.id)) this.roomSockets.set(room.id, new Set())
		this.roomSockets.get(room.id)!.add(socket.id)
		this.socketMeta.set(socket.id, {
			userId: socket.userId,
			roomId: room.id,
			isBackground: false
		})

		const history = await this.chat.getHistory(room.id)
		socket.emit('history', history)
		socket.emit('joined', { roomId: room.id })
		socket.emit('presence:list', {
			userIds: this.getOnlineUserIds(room.id)
		})
		this.broadcastToRoom(
			room.id,
			'presence:joined',
			{ userId: socket.userId },
			socket.id
		)

		const { ids: readIds, readAt } = await this.chat.markRoomAsRead(
			room.id,
			socket.userId
		)
		if (readIds.length > 0) {
			this.broadcastToRoom(room.id, 'messages:read', {
				ids: readIds,
				userId: socket.userId,
				readAt
			})
		}
	}

	@SubscribeMessage('history:load-more')
	async handleLoadMore(
		@ConnectedSocket() socket: AuthSocket,
		@MessageBody() data: { skip: number }
	) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta) return
		const skip = Number(data?.skip) || 0
		const msgs = await this.chat.getHistory(meta.roomId, skip)
		socket.emit('history:more', { msgs, hasMore: msgs.length === 50 })
	}

	@SubscribeMessage('message')
	async handleMessage(
		@ConnectedSocket() socket: AuthSocket,
		@MessageBody()
		data: { text?: string; replyToId?: string; imageUrls?: string[] }
	) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta) return

		const text = data?.text?.trim() ?? ''
		const imageUrls = data?.imageUrls?.length ? data.imageUrls : undefined
		if (!text && !imageUrls) return

		const onlineOthers = this.getOnlineUserIds(meta.roomId).filter(
			id => id !== meta.userId
		)
		const msg = await this.chat.saveMessage(
			meta.roomId,
			meta.userId,
			text,
			data?.replyToId,
			imageUrls,
			onlineOthers
		)
		await this.chat.touchRoom(meta.roomId)

		this.broadcastToRoom(meta.roomId, 'message', msg)

		const senderName = msg.sender.name || msg.sender.displayName || 'Кто-то'
		const messageText = imageUrls?.length
			? `📷 ${imageUrls.length > 1 ? `${imageUrls.length} фото` : 'Фото'}`
			: text
		await this.chat.sendPushToParticipants(
			meta.roomId,
			'💬 Командный чат',
			`${senderName}: ${messageText}`,
			meta.userId,
			onlineOthers
		)
	}

	@SubscribeMessage('app:background')
	handleBackground(@ConnectedSocket() socket: AuthSocket) {
		const meta = this.socketMeta.get(socket.id)
		if (meta) meta.isBackground = true
	}

	@SubscribeMessage('app:foreground')
	handleForeground(@ConnectedSocket() socket: AuthSocket) {
		const meta = this.socketMeta.get(socket.id)
		if (meta) meta.isBackground = false
	}

	@SubscribeMessage('typing:start')
	handleTypingStart(@ConnectedSocket() socket: AuthSocket) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta) return
		this.broadcastToRoom(
			meta.roomId,
			'typing:start',
			{ userId: meta.userId },
			socket.id
		)
	}

	@SubscribeMessage('typing:stop')
	handleTypingStop(@ConnectedSocket() socket: AuthSocket) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta) return
		this.broadcastToRoom(
			meta.roomId,
			'typing:stop',
			{ userId: meta.userId },
			socket.id
		)
	}

	@SubscribeMessage('message:edit')
	async handleEdit(
		@ConnectedSocket() socket: AuthSocket,
		@MessageBody() data: { messageId: string; text: string }
	) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta || !data?.messageId || !data?.text?.trim()) return

		const existing = await this.chat.getMessage(data.messageId)
		if (!existing || existing.senderId !== meta.userId) return

		const updated = await this.chat.editMessage(
			data.messageId,
			data.text.trim()
		)
		this.broadcastToRoom(meta.roomId, 'message:edited', updated)
	}

	@SubscribeMessage('message:delete')
	async handleDelete(
		@ConnectedSocket() socket: AuthSocket,
		@MessageBody() data: { messageId: string }
	) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta || !data?.messageId) return

		const existing = await this.chat.getMessage(data.messageId)
		if (!existing || existing.senderId !== meta.userId) return

		await this.chat.deleteMessage(data.messageId)
		this.broadcastToRoom(meta.roomId, 'message:deleted', {
			messageId: data.messageId
		})
	}

	@SubscribeMessage('reaction:toggle')
	async handleReaction(
		@ConnectedSocket() socket: AuthSocket,
		@MessageBody() data: { messageId: string; emoji: string }
	) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta || !data?.messageId || !data?.emoji) return

		const existing = await this.chat.getMessage(data.messageId)
		if (!existing || existing.roomId !== meta.roomId) return

		const reactions = await this.chat.toggleReaction(
			data.messageId,
			meta.userId,
			data.emoji
		)
		this.broadcastToRoom(meta.roomId, 'message:reacted', {
			messageId: data.messageId,
			reactions
		})
	}

	kickParticipant(userId: string) {
		for (const [socketId, meta] of this.socketMeta.entries()) {
			if (meta.userId !== userId) continue
			this.roomSockets.get(meta.roomId)?.delete(socketId)
			this.socketMeta.delete(socketId)
			this.broadcastToRoom(meta.roomId, 'presence:left', { userId })
			const socket = this.server.sockets.sockets.get(socketId)
			if (socket) {
				socket.emit('kicked')
				socket.disconnect(true)
			}
		}
	}

	private broadcastToRoom(
		roomId: string,
		event: string,
		data: any,
		excludeSocketId?: string
	) {
		const sockets = this.roomSockets.get(roomId) ?? new Set()
		for (const sid of sockets) {
			if (sid === excludeSocketId) continue
			this.server.to(sid).emit(event, data)
		}
	}

	private getOnlineUserIds(roomId: string): string[] {
		const sockets = this.roomSockets.get(roomId) ?? new Set()
		return [...sockets]
			.map(sid => this.socketMeta.get(sid))
			.filter((m): m is SocketMeta => !!m && !m.isBackground)
			.map(m => m.userId)
	}
}
