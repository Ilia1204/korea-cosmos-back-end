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
}

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer() server: Server

	// roomId → Set<socketId>
	private roomSockets = new Map<string, Set<string>>()
	// socketId → meta
	private socketMeta = new Map<string, SocketMeta>()

	constructor(
		private chat: ChatService,
		private jwt: JwtService
	) {}

	handleConnection(socket: AuthSocket) {
		try {
			const token = socket.handshake.auth?.token as string
			if (!token) { socket.disconnect(); return }

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
		this.emitToPartner(meta.roomId, meta.isAdmin, 'presence:left', { lastSeenAt })
	}

	@SubscribeMessage('join')
	async handleJoin(
		@ConnectedSocket() socket: AuthSocket,
		@MessageBody() data: { roomId?: string }
	) {
		if (!socket.userId) { socket.emit('error', 'unauthorized'); return }

		// JWT payload has only { id } — no role. Fetch from DB.
		const role = await this.chat.getUserRole(socket.userId)
		if (!role) { socket.emit('error', 'unauthorized'); return }
		socket.isAdmin = role === 'admin' || role === 'manager'

		let roomId: string

		if (socket.isAdmin) {
			if (!data?.roomId) { socket.emit('error', 'roomId required'); return }
			roomId = data.roomId
		} else {
			const room = await this.chat.getOrCreateRoom(socket.userId)
			roomId = room.id
		}

		// Register in our manual tracking
		if (!this.roomSockets.has(roomId)) this.roomSockets.set(roomId, new Set())
		this.roomSockets.get(roomId)!.add(socket.id)
		this.socketMeta.set(socket.id, { userId: socket.userId, isAdmin: !!socket.isAdmin, roomId })

		await this.chat.markAsRead(roomId, !!socket.isAdmin)

		const history = await this.chat.getHistory(roomId)
		socket.emit('history', history.reverse())
		socket.emit('joined', { roomId })

		// Tell partner we joined
		this.emitToPartner(roomId, !!socket.isAdmin, 'presence:joined', { isAdmin: !!socket.isAdmin })

		// Tell self whether partner is online
		const partnerOnline = this.hasPartner(roomId, !!socket.isAdmin)
		if (partnerOnline) {
			socket.emit('presence:partner', { online: true })
		} else {
			const partnerUserId = await this.getPartnerUserId(roomId, !!socket.isAdmin)
			const lastSeenAt = partnerUserId
				? (await this.chat.getLastSeen(partnerUserId))?.toISOString() ?? null
				: null
			socket.emit('presence:partner', { online: false, lastSeenAt })
		}
	}

	@SubscribeMessage('message')
	async handleMessage(
		@ConnectedSocket() socket: AuthSocket,
		@MessageBody() data: { text: string }
	) {
		const meta = this.socketMeta.get(socket.id)
		if (!meta) return

		const { roomId, isAdmin, userId } = meta
		const text = data?.text?.trim()
		if (!text) return

		const msg = await this.chat.saveMessage(roomId, userId, text, isAdmin)
		await this.chat.touchRoom(roomId)

		// Send to ALL sockets in this room directly by socketId
		const sockets = this.roomSockets.get(roomId) ?? new Set()
		for (const sid of sockets) {
			this.server.to(sid).emit('message', msg)
		}

		const partnerOnline = this.hasPartner(roomId, isAdmin)
		if (!partnerOnline) {
			if (isAdmin) {
				const room = await this.chat.getRoomFromId(roomId)
				if (room) await this.chat.sendPushToUser(room.userId, 'Поддержка', text)
			} else {
				const userName = await this.chat.getUserDisplayName(userId)
				await this.chat.sendPushToAdmins(
					userName,
					text,
					userId,
					{ roomId, userName }
				)
			}
		}
	}

	// Returns userId of the partner (opposite role) in the room
	private async getPartnerUserId(roomId: string, myIsAdmin: boolean): Promise<string | null> {
		if (myIsAdmin) {
			// Partner is the room owner (user)
			const room = await this.chat.getRoomFromId(roomId)
			return room?.userId ?? null
		} else {
			// Partner is an admin — find last admin who replied in this room
			return this.chat.getLastAdminSenderInRoom(roomId)
		}
	}

	// Send event to all sockets in room with opposite isAdmin value
	private emitToPartner(roomId: string, myIsAdmin: boolean, event: string, data: any) {
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
			return m && m.isAdmin !== myIsAdmin
		})
	}
}
