import { Module } from '@nestjs/common'
import { LoyaltyLevelModule } from 'src/loyalty-level/loyalty-level.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { WooSyncModule } from 'src/woo-sync/woo-sync.module'
import { WebhookCustomersService } from './webhook-customers.service'
import { WebhookOrdersService } from './webhook-orders.service'
import { WebhookProductsService } from './webhook-products.service'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'

@Module({
	imports: [NotificationsModule, LoyaltyLevelModule, WooSyncModule],
	controllers: [WebhookController],
	providers: [
		WebhookService,
		WebhookOrdersService,
		WebhookProductsService,
		WebhookCustomersService,
		PrismaService
	]
})
export class WebhookModule {}
