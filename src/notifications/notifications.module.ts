import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { UserModule } from 'src/user/user.module'
import { NotificationsController } from './notifications.controller'
import { NotificationsScheduledService } from './notifications-scheduled.service'
import { NotificationsService } from './notifications.service'

@Module({
	imports: [UserModule],
	controllers: [NotificationsController],
	providers: [NotificationsService, NotificationsScheduledService, PrismaService],
	exports: [NotificationsService]
})
export class NotificationsModule {}
