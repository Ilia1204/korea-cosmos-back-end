import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'

@Module({
	controllers: [NotificationsController],
	providers: [NotificationsService, PrismaService, UserService],
	exports: [NotificationsService]
})
export class NotificationsModule {}
