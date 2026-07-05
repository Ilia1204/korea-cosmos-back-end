import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { WooSyncModule } from 'src/woo-sync/woo-sync.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { MoyskladClient } from './moysklad.client'
import { WooDiscountController } from './woo-discount.controller'
import { WooDiscountReminderService } from './woo-discount-reminder.service'
import { WooDiscountService } from './woo-discount.service'

@Module({
	imports: [WooSyncModule, NotificationsModule],
	controllers: [WooDiscountController],
	providers: [
		WooDiscountService,
		WooDiscountReminderService,
		MoyskladClient,
		PrismaService
	]
})
export class WooDiscountModule {}
