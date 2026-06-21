import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { NotificationsController } from './notifications.controller'
import { NotificationsScheduledService } from './notifications-scheduled.service'
import { NotificationsService } from './notifications.service'

@Module({
	controllers: [NotificationsController],
	providers: [
		NotificationsService,
		NotificationsScheduledService,
		PrismaService,
		UserService
	],
	exports: [NotificationsService]
})
export class NotificationsModule {}
