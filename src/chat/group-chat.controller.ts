import {
	BadRequestException,
	Controller,
	Delete,
	Get,
	Param,
	Post
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { GroupChatService } from './group-chat.service'

@Controller('group-chat')
export class GroupChatController {
	constructor(private chat: GroupChatService) {}

	@Get('room')
	@Auth('manager')
	async getMyRoom(@CurrentUser('id') userId: string) {
		const room = await this.chat.getOrCreateDefaultRoom()
		const isParticipant = await this.chat.isParticipant(room.id, userId)
		if (!isParticipant) return { roomId: room.id, isParticipant: false }

		const history = await this.chat.getHistory(room.id)
		return { roomId: room.id, isParticipant: true, messages: history.reverse() }
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
	async addParticipant(@Param('userId') userId: string) {
		if (!userId) throw new BadRequestException('userId обязателен')
		const room = await this.chat.getOrCreateDefaultRoom()
		await this.chat.addParticipant(room.id, userId)
		return { ok: true }
	}

	@Delete('participants/:userId')
	@Auth('manager')
	async removeParticipant(@Param('userId') userId: string) {
		const room = await this.chat.getOrCreateDefaultRoom()
		await this.chat.removeParticipant(room.id, userId)
		return { ok: true }
	}
}
