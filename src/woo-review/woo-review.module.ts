import { Module } from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { WooReviewModerationService } from './woo-review-moderation.service'
import { WooReviewQueriesService } from './woo-review-queries.service'
import { WooReviewWooClient } from './woo-review-woo.client'
import { WooReviewController } from './woo-review.controller'
import { WooReviewService } from './woo-review.service'

@Module({
	controllers: [WooReviewController],
	providers: [
		WooReviewService,
		WooReviewQueriesService,
		WooReviewModerationService,
		WooReviewWooClient,
		PrismaService,
		UserService,
		NotificationsService
	]
})
export class WooReviewModule {}
