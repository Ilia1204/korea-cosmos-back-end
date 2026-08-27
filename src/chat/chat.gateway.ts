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
import { ChatService } from './chat.service'

interface AuthSocket extends Socket {
	userId?: string
	isAdmin?: boolean
}

interface SocketMeta {
	userId: string
	isAdmin: boolean
	roomId: string
	isBackground: boolean
}

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer() server: Server

	// roomId → Set<socketId>
	private roomSockets = new Map<string, Set<string>>()
	// socketId → meta
	private socketMeta = new Map<string, SocketMeta>()

	constructor(private chat: ChatService, private jwt: JwtService) {}

	handleConnection(socket: AuthSocket) {
		try {
			const token = socket.handshake.auth?.token as string
			if (!token) {
				socket.disconnect()
				return
			}

			const payload = this.jwt.verify(token)
			socket.userId = payload.id
			socket.isAdmin = payload.role === 'admin' || payload.role === 'manager'
		} catch {
			socket.disconnect()
		}
	}

	handleDisconnect(socket: AuthSocket) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta) return

		this.roomSockets.get(meta.roomId)?.delete(socket.id)
		this.socketMeta.delete(socket.id)

		const lastSeenAt = new Date().toISOString()
		this.chat.updateLastSeen(meta.userId).catch(() => null)
		this.emitToPartner(meta.roomId, meta.isAdmin, 'presence:left', {
			lastSeenAt
		})
	}

	@SubscribeMessage('join')
	async handleJoin(
		@ConnectedSocket() socket: AuthSocket,
		@MessageBody() data: { roomId?: string }
	) {
		if (!socket.userId) {
			socket.emit('error', 'unauthorized')
			return
		}

		// JWT payload has only { id } — no role. Fetch from DB.
		const role = await this.chat.getUserRole(socket.userId)
		if (!role) {
			socket.emit('error', 'unauthorized')
			return
		}
		socket.isAdmin = role === 'admin' || role === 'manager'

		let roomId: string

		if (socket.isAdmin) {
			if (!data?.roomId) {
				socket.emit('error', 'roomId required')
				return
			}
			roomId = data.roomId
		} else {
			const room = await this.chat.getOrCreateRoom(socket.userId)
			roomId = room.id
		}

		// Register in our manual tracking
		if (!this.roomSockets.has(roomId)) this.roomSockets.set(roomId, new Set())
		this.roomSockets.get(roomId)!.add(socket.id)
		this.socketMeta.set(socket.id, {
			userId: socket.userId,
			isAdmin: !!socket.isAdmin,
			roomId,
			isBackground: false
		})

		if (!socket.isAdmin) {
			const count = await this.chat.getMessageCount(roomId)
			if (count === 0) {
				await this.chat.saveMessage(
					roomId,
					null,
					'Здравствуйте! Чем могу помочь? 😊',
					true
				)
			}
		}

		const history = await this.chat.getHistory(roomId)
		const roomStatus = await this.chat.getRoomStatus(roomId)
		socket.emit('history', history)
		socket.emit('joined', {
			roomId,
			roomStatus: roomStatus ?? 'open'
		})

		const readIds = await this.chat.markAsReadAndGetIds(
			roomId,
			!!socket.isAdmin
		)
		if (readIds.length > 0) {
			this.emitToPartner(roomId, !!socket.isAdmin, 'messages:read', {
				ids: readIds
			})
		}

		// Tell partner we joined
		this.emitToPartner(roomId, !!socket.isAdmin, 'presence:joined', {
			isAdmin: !!socket.isAdmin
		})

		// Tell self whether partner is online
		const partnerOnline = this.hasPartner(roomId, !!socket.isAdmin)
		if (partnerOnline) {
			socket.emit('presence:partner', { online: true })
		} else {
			const partnerUserId = await this.getPartnerUserId(
				roomId,
				!!socket.isAdmin
			)
			const lastSeenAt = partnerUserId
				? (await this.chat.getLastSeen(partnerUserId))?.toISOString() ?? null
				: null
			socket.emit('presence:partner', { online: false, lastSeenAt })
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

	@SubscribeMessage('room:close')
	async handleCloseRoom(@ConnectedSocket() socket: AuthSocket) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta || !socket.isAdmin) return
		await this.chat.closeRoom(meta.roomId)
		const sockets = this.roomSockets.get(meta.roomId) ?? new Set()
		for (const sid of sockets) {
			this.server.to(sid).emit('room:status', { status: 'closed' })
		}
	}

	@SubscribeMessage('message')
	async handleMessage(
		@ConnectedSocket() socket: AuthSocket,
		@MessageBody()
		data: {
			text?: string
			replyToId?: string
			imageUrls?: string[]
		}
	) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta) return

		const { roomId, isAdmin, userId } = meta
		const text = data?.text?.trim() ?? ''
		const imageUrls = data?.imageUrls?.length ? data.imageUrls : undefined
		if (!text && !imageUrls) return

		// Auto-reopen closed chat when user (not admin) sends a message
		if (!isAdmin) {
			const currentStatus = await this.chat.getRoomStatus(roomId)
			if (currentStatus === 'closed') {
				await this.chat.reopenRoom(roomId)
				const sockets = this.roomSockets.get(roomId) ?? new Set()
				for (const sid of sockets) {
					this.server.to(sid).emit('room:status', { status: 'open' })
				}
			}
		}

		const msg = await this.chat.saveMessage(
			roomId,
			userId,
			text,
			isAdmin,
			data?.replyToId,
			imageUrls
		)
		await this.chat.touchRoom(roomId)

		const partnerOnline = this.hasPartner(roomId, isAdmin)

		// If partner is online — mark this message as read immediately
		if (partnerOnline) {
			await this.chat.markMessageAsRead(msg.id)
			msg.isRead = true
		}

		// Send to ALL sockets in this room directly by socketId
		const sockets = this.roomSockets.get(roomId) ?? new Set()
		for (const sid of sockets) {
			this.server.to(sid).emit('message', msg)
		}
		if (!partnerOnline) {
			const pushBody = imageUrls?.length ? `📷 ${imageUrls.length} фото` : text
			if (isAdmin) {
				const room = await this.chat.getRoomFromId(roomId)
				if (room)
					await this.chat.sendPushToUser(room.userId, 'Поддержка', pushBody)
			} else {
				const userName = await this.chat.getUserDisplayName(userId)
				await this.chat.sendPushToAdmins(userName, pushBody, userId, {
					roomId,
					userName
				})
			}
		}
	}

	@SubscribeMessage('typing:start')
	handleTypingStart(@ConnectedSocket() socket: AuthSocket) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta) return
		this.emitToPartner(meta.roomId, meta.isAdmin, 'typing:start', {})
	}

	@SubscribeMessage('typing:stop')
	handleTypingStop(@ConnectedSocket() socket: AuthSocket) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta) return
		this.emitToPartner(meta.roomId, meta.isAdmin, 'typing:stop', {})
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
		if (!existing) return
		// user can delete own, admin can delete any
		if (!meta.isAdmin && existing.senderId !== meta.userId) return

		await this.chat.deleteMessage(data.messageId)
		this.broadcastToRoom(meta.roomId, 'message:deleted', {
			messageId: data.messageId
		})
	}

	@SubscribeMessage('message:restore')
	async handleRestore(
		@ConnectedSocket() socket: AuthSocket,
		@MessageBody() data: { messageId: string }
	) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta || !meta.isAdmin || !data?.messageId) return

		const existing = await this.chat.getMessage(data.messageId)
		if (!existing || !existing.deletedAt) return

		const restored = await this.chat.restoreMessage(data.messageId)
		this.broadcastToRoom(meta.roomId, 'message:restored', restored)
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

	private broadcastToRoom(roomId: string, event: string, data: any) {
		const sockets = this.roomSockets.get(roomId) ?? new Set()
		for (const sid of sockets) {
			this.server.to(sid).emit(event, data)
		}
	}

	private async getPartnerUserId(
		roomId: string,
		myIsAdmin: boolean
	): Promise<string | null> {
		if (myIsAdmin) {
			// Partner is the room owner (user)
			const room = await this.chat.getRoomFromId(roomId)
			return room?.userId ?? null
		} else {
			return this.chat.getLastAdminSenderInRoom(roomId)
		}
	}

	private emitToPartner(
		roomId: string,
		myIsAdmin: boolean,
		event: string,
		data: any
	) {
		const sockets = this.roomSockets.get(roomId) ?? new Set()
		for (const sid of sockets) {
			const m = this.socketMeta.get(sid)
			if (m && m.isAdmin !== myIsAdmin) {
				this.server.to(sid).emit(event, data)
			}
		}
	}

	private hasPartner(roomId: string, myIsAdmin: boolean): boolean {
		const sockets = this.roomSockets.get(roomId) ?? new Set()
		return [...sockets].some(sid => {
			const m = this.socketMeta.get(sid)
			return m && m.isAdmin !== myIsAdmin && !m.isBackground
		})
	}
}
