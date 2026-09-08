import { Module } from '@nestjs/common'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { UserModule } from 'src/user/user.module'
import { WooReviewModerationService } from './woo-review-moderation.service'
import { WooReviewQueriesService } from './woo-review-queries.service'
import { WooReviewWooClient } from './woo-review-woo.client'
import { WooReviewController } from './woo-review.controller'
import { WooReviewService } from './woo-review.service'

@Module({
	imports: [UserModule, NotificationsModule],
	controllers: [WooReviewController],
	providers: [
		WooReviewService,
		WooReviewQueriesService,
		WooReviewModerationService,
		WooReviewWooClient,
		PrismaService
	]
})
export class WooReviewModule {}
