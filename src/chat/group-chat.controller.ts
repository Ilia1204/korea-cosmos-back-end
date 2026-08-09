import {
	BadRequestException,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	Param,
	Post,
	Query
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { GroupChatGateway } from './group-chat.gateway'
import { GroupChatService } from './group-chat.service'

@Controller('group-chat')
export class GroupChatController {
	constructor(
		private chat: GroupChatService,
		private gateway: GroupChatGateway
	) {}

	@Get('room')
	@Auth('manager')
	async getMyRoom(@CurrentUser('id') userId: string) {
		const room = await this.chat.getOrCreateDefaultRoom()
		const isParticipant = await this.chat.isParticipant(room.id, userId)
		if (!isParticipant) return { roomId: room.id, isParticipant: false }

		const history = await this.chat.getHistory(room.id)
		return { roomId: room.id, isParticipant: true, messages: history.reverse() }
	}

	@Get('summary')
	@Auth('manager')
	async getSummary(@CurrentUser('id') userId: string) {
		const room = await this.chat.getOrCreateDefaultRoom()
		const isParticipant = await this.chat.isParticipant(room.id, userId)
		if (!isParticipant) return { isParticipant: false }

		const [lastMessage, unreadCount] = await Promise.all([
			this.chat.getLastMessage(room.id),
			this.chat.getUnreadCount(room.id, userId)
		])
		return { isParticipant: true, lastMessage, unreadCount }
	}

	@Get('search')
	@Auth('manager')
	async search(
		@CurrentUser('id') userId: string,
		@Query('q') q?: string
	) {
		if (!q?.trim()) return []
		const room = await this.chat.getOrCreateDefaultRoom()
		const isParticipant = await this.chat.isParticipant(room.id, userId)
		if (!isParticipant) return []
		return this.chat.searchMessages(room.id, q.trim())
	}

	@Get('participants')
	@Auth('manager')
	async getParticipants() {
		const room = await this.chat.getOrCreateDefaultRoom()
		return this.chat.listParticipants(room.id)
	}

	@Get('eligible-users')
	@Auth('manager')
	async getEligibleUsers() {
		const room = await this.chat.getOrCreateDefaultRoom()
		return this.chat.getEligibleUsers(room.id)
	}

	@Post('participants/:userId')
	@Auth('manager')
	async addParticipant(
		@Param('userId') userId: string,
		@CurrentUser('id') currentUserId: string,
		@CurrentUser('role') currentUserRole: string
	) {
		if (!userId) throw new BadRequestException('userId обязателен')
		if (userId !== currentUserId && currentUserRole !== 'admin') {
			throw new ForbiddenException(
				'Добавлять других участников может только администратор'
			)
		}
		const room = await this.chat.getOrCreateDefaultRoom()
		const wasParticipant = await this.chat.isParticipant(room.id, userId)
		await this.chat.addParticipant(room.id, userId)
		if (!wasParticipant) {
			if (currentUserId !== userId) {
				await this.chat.sendAddedToChatPush(userId, currentUserId)
			}
			await this.chat.sendJoinedPushToParticipants(
				room.id,
				userId,
				currentUserId
			)
		}
		return { ok: true }
	}

	@Delete('participants/:userId')
	@Auth('manager')
	async removeParticipant(
		@Param('userId') userId: string,
		@CurrentUser('id') currentUserId: string,
		@CurrentUser('role') currentUserRole: string
	) {
		if (userId !== currentUserId && currentUserRole !== 'admin') {
			throw new ForbiddenException(
				'Удалять других участников может только администратор'
			)
		}
		const room = await this.chat.getOrCreateDefaultRoom()
		const wasParticipant = await this.chat.isParticipant(room.id, userId)
		await this.chat.removeParticipant(room.id, userId)
		if (wasParticipant) {
			this.gateway.kickParticipant(userId)
			if (currentUserId !== userId) {
				await this.chat.sendRemovedFromChatPush(userId, currentUserId)
			}
		}
		return { ok: true }
	}
}
