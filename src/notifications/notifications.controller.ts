import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Post,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { NotificationsService } from './notifications.service'

@Controller('notifications')
export class NotificationsController {
	constructor(private readonly notificationsService: NotificationsService) {}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Post('save-token')
	@Auth()
	async saveToken(
		@CurrentUser('id') id: string,
		@Body() body: { token: string }
	) {
		return this.notificationsService.savePushToken(id, body.token)
	}

	@HttpCode(200)
	@Get('by-user')
	@Auth()
	async getNotifications(@CurrentUser('id') id: string) {
		return this.notificationsService.getNotificationsForUser(id)
	}

	@HttpCode(200)
	@Auth()
	@Delete('by-user')
	async clearFavorites(@CurrentUser('id') id: string) {
		return this.notificationsService.clearNotifications(id)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth()
	async deleteNotification(
		@Param('id') id: string,
		@CurrentUser('id') userId: string
	) {
		return this.notificationsService.delete(id, userId)
	}
}
