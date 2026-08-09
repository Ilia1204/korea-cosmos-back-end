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
import { GroupChatService } from './group-chat.service'

@Controller('chat')
export class ChatController {
	constructor(
		private chat: ChatService,
		private file: FileService,
		private groupChat: GroupChatService
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
	@Auth('manager')
	async getUnreadCount(@CurrentUser('id') userId: string) {
		const [supportCount, teamRoom] = await Promise.all([
			this.chat.getUnreadRoomsCount(),
			this.groupChat.getOrCreateDefaultRoom()
		])
		const isParticipant = await this.groupChat.isParticipant(
			teamRoom.id,
			userId
		)
		const teamUnread = isParticipant
			? await this.groupChat.getUnreadCount(teamRoom.id, userId)
			: 0
		return { count: supportCount + (teamUnread > 0 ? 1 : 0) }
	}

	@Get('rooms')
	@Auth('manager')
	async getAllRooms() {
		const rooms = await this.chat.getAllRooms()
		return rooms.map(r => ({
			id: r.id,
			updatedAt: r.updatedAt,
			status: r.status,
			pinned: r.pinned,
			user: r.user,
			lastMessage: r.messages[0] ?? null,
			unreadCount: r.unreadCount
		}))
	}

	@Get('rooms/:roomId/history')
	@Auth('manager')
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

	@Post('rooms/:roomId/pin')
	@Auth('manager')
	async togglePin(@Param('roomId') roomId: string) {
		const pinned = await this.chat.togglePin(roomId)
		return { pinned }
	}

	@Post('rooms/:roomId/mute')
	@Auth('manager')
	async toggleMute(
		@Param('roomId') roomId: string,
		@CurrentUser('id') adminId: string
	) {
		const muted = await this.chat.toggleMute(roomId, adminId)
		return { muted }
	}

	@Get('rooms/:roomId/mute')
	@Auth('manager')
	async getMuteStatus(
		@Param('roomId') roomId: string,
		@CurrentUser('id') adminId: string
	) {
		const mutedByIds = await this.chat.getMutedByIds(roomId)
		return { muted: mutedByIds.includes(adminId) }
	}
}
