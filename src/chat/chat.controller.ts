import {
	BadRequestException,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Post,
	Query,
	DefaultValuePipe,
	UploadedFiles,
	UseInterceptors
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express/multer/interceptors/files.interceptor'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { FileService } from 'src/file/file.service'
import { ChatService } from './chat.service'

@Controller('chat')
export class ChatController {
	constructor(
		private chat: ChatService,
		private file: FileService
	) {}

	@Post('upload-file')
	@Auth()
	@UseInterceptors(FilesInterceptor('file', 10, { limits: { files: 10 } }))
	async uploadChatImage(@UploadedFiles() files: any[]) {
		if (!files?.length) throw new BadRequestException('Файл не загружен')
		const result = await this.file.saveFiles(files, 'chat-images')
		return { url: result.data[0].path }
	}

	@Get('room')
	@Auth('user')
	async getMyRoom(@CurrentUser('id') userId: string) {
		const room = await this.chat.getOrCreateRoom(userId)
		const history = await this.chat.getHistory(room.id)
		return { roomId: room.id, messages: history.reverse() }
	}

	@Get('unread-count')
	@Auth('admin')
	async getUnreadCount() {
		const count = await this.chat.getUnreadRoomsCount()
		return { count }
	}

	@Get('rooms')
	@Auth('admin')
	async getAllRooms() {
		const rooms = await this.chat.getAllRooms()
		return rooms.map(r => ({
			id: r.id,
			updatedAt: r.updatedAt,
			user: r.user,
			lastMessage: r.messages[0] ?? null,
			unreadCount: r.unreadCount
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

	@Delete('rooms/:roomId')
	@Auth('admin')
	async deleteRoom(@Param('roomId') roomId: string) {
		await this.chat.deleteRoom(roomId)
		return { ok: true }
	}

	@Post('rooms/:roomId/mute')
	@Auth('admin')
	async toggleMute(
		@Param('roomId') roomId: string,
		@CurrentUser('id') adminId: string
	) {
		const muted = await this.chat.toggleMute(roomId, adminId)
		return { muted }
	}

	@Get('rooms/:roomId/mute')
	@Auth('admin')
	async getMuteStatus(
		@Param('roomId') roomId: string,
		@CurrentUser('id') adminId: string
	) {
		const mutedByIds = await this.chat.getMutedByIds(roomId)
		return { muted: mutedByIds.includes(adminId) }
	}
}
