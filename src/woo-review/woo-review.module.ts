import { Module } from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { WooReviewController } from './woo-review.controller'
import { WooReviewService } from './woo-review.service'

@Module({
	controllers: [WooReviewController],
	providers: [WooReviewService, PrismaService, UserService, NotificationsService]
})
export class WooReviewModule {}
