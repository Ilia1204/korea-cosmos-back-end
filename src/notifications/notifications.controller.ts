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
import {
	AdminBroadcastDto,
	ScheduleBroadcastDto
} from './dto/admin-notification.dto'
import { NotificationsService } from './notifications.service'

@Controller('notifications')
@UsePipes(new ValidationPipe())
export class NotificationsController {
	constructor(private readonly notificationsService: NotificationsService) {}

	@HttpCode(200)
	@Auth()
	@Patch('mark-as-read/:notificationId')
	async markAsRead(@Param('notificationId') notificationId: string) {
		return this.notificationsService.markAsRead(notificationId)
	}

	@HttpCode(200)
	@Auth()
	@Patch('tap/:notificationId')
	async tapNotification(@Param('notificationId') notificationId: string) {
		return this.notificationsService.tapNotification(notificationId)
	}

	@HttpCode(200)
	@Get('admin/analytics')
	@Auth('admin')
	async adminAnalytics() {
		return this.notificationsService.getAdminAnalytics()
	}

	@HttpCode(200)
	@Delete('admin/broadcast/:broadcastId')
	@Auth('admin')
	async deleteBroadcast(@Param('broadcastId') broadcastId: string) {
		return this.notificationsService.deleteBroadcast(broadcastId)
	}

	@HttpCode(200)
	@Delete('admin/broadcasts')
	@Auth('admin')
	async deleteAllBroadcasts() {
		return this.notificationsService.deleteAllBroadcasts()
	}

	@HttpCode(200)
	@Auth()
	@Patch('mark-all-as-read')
	async markAllAsRead(@CurrentUser('id') id: string) {
		return this.notificationsService.markAllAsRead(id)
	}

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
	async clearToken(
		@CurrentUser('id') id: string,
		@Body() body: { token?: string }
	) {
		return this.notificationsService.clearPushToken(id, body?.token)
	}

	@HttpCode(200)
	@Post('subscribe-to-product')
	@Auth()
	async subscribeToProductStockNotification(
		@CurrentUser('id') id: string,
		@Body() body: { productSlug: string }
	) {
		return this.notificationsService.subscribeToProductStockNotification(
			id,
			body.productSlug
		)
	}

	@HttpCode(200)
	@Get('subscribed-products')
	@Auth()
	async getSubscribedProducts(@CurrentUser('id') id: string) {
		return this.notificationsService.getSubscribedProducts(id)
	}

	@HttpCode(200)
	@Delete('unsubscribe/:slug')
	@Auth()
	async unsubscribeFromProduct(
		@Param('slug') slug: string,
		@CurrentUser('id') userId: string
	) {
		return this.notificationsService.unsubscribeFromProduct(userId, slug)
	}

	@HttpCode(200)
	@Get('by-user')
	@Auth()
	async getByUser(@CurrentUser('id') id: string) {
		return this.notificationsService.getNotificationsForUser(id)
	}

	@HttpCode(200)
	@Auth()
	@Delete('by-user')
	async clearNotifications(@CurrentUser('id') id: string) {
		return this.notificationsService.clearNotifications(id)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth()
	async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
		return this.notificationsService.delete(id, userId)
	}

	@HttpCode(200)
	@Post('admin/broadcast')
	@Auth('admin')
	async adminBroadcast(@Body() dto: AdminBroadcastDto) {
		return this.notificationsService.sendAdminBroadcast(
			dto.title,
			dto.body,
			dto.data,
			dto.segment,
			dto.categorySlug,
			dto.frequencyDays
		)
	}

	@HttpCode(200)
	@Get('admin/history')
	@Auth('admin')
	async adminHistory(@CurrentUser('id') id: string) {
		return this.notificationsService.getAdminBroadcastHistory(id)
	}

	@HttpCode(200)
	@Post('admin/schedule')
	@Auth('admin')
	async scheduleAdminBroadcast(@Body() dto: ScheduleBroadcastDto) {
		return this.notificationsService.scheduleAdminBroadcast(dto)
	}

	@HttpCode(200)
	@Get('admin/scheduled')
	@Auth('admin')
	async getScheduledBroadcasts() {
		return this.notificationsService.getScheduledBroadcasts()
	}

	@HttpCode(200)
	@Delete('admin/scheduled/:id')
	@Auth('admin')
	async deleteScheduledBroadcast(@Param('id') id: string) {
		return this.notificationsService.deleteScheduledBroadcast(id)
	}
}
