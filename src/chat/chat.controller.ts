import {
	Controller,
	Get,
	Param,
	ParseIntPipe,
	Query,
	DefaultValuePipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { ChatService } from './chat.service'

@Controller('chat')
export class ChatController {
	constructor(private chat: ChatService) {}

	@Get('room')
	@Auth('user')
	async getMyRoom(@CurrentUser('id') userId: string) {
		const room = await this.chat.getOrCreateRoom(userId)
		const history = await this.chat.getHistory(room.id)
		return { roomId: room.id, messages: history.reverse() }
	}

	@Get('rooms')
	@Auth('admin')
	async getAllRooms() {
		const rooms = await this.chat.getAllRooms()
		return rooms.map(r => ({
			id: r.id,
			updatedAt: r.updatedAt,
			user: r.user,
			lastMessage: r.messages[0] ?? null
		}))
	}

	@Get('rooms/:roomId/history')
	@Auth('admin')
	async getRoomHistory(
		@Param('roomId') roomId: string,
		@Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number
	) {
		const messages = await this.chat.getHistory(roomId, skip)
		return messages.reverse()
	}
}
