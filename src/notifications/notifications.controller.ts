import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
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

	@HttpCode(200)
	@Auth()
	@Patch('mark-as-read/:notificationId')
	async markAsRead(@Param('notificationId') notificationId: string) {
		return this.notificationsService.markAsRead(notificationId)
	}

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
	@Delete('token')
	@Auth()
	async clearToken(@CurrentUser('id') id: string) {
		return this.notificationsService.clearPushToken(id)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Post('subscribe-to-product')
	@Auth()
	async subscribeToProductStockNotification(
		@CurrentUser('id') id: string,
		@Body() body: { productId: string }
	) {
		return this.notificationsService.subscribeToProductStockNotification(
			id,
			body.productId
		)
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
