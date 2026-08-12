import { Module } from '@nestjs/common'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { WooCacheModule } from 'src/woo-proxy/woo-cache.module'
import { WooApiClient } from './woo-api.client'
import { WooOrdersService } from './woo-orders.service'
import { WooProductAdminService } from './woo-product-admin.service'
import { WooProductsService } from './woo-products.service'
import { WooSyncController } from './woo-sync.controller'
import { WooSyncService } from './woo-sync.service'

@Module({
	imports: [NotificationsModule, WooCacheModule],
	controllers: [WooSyncController],
	providers: [
		WooApiClient,
		WooOrdersService,
		WooProductsService,
		WooProductAdminService,
		WooSyncService,
		PrismaService
	],
	exports: [WooSyncService, WooApiClient]
})
export class WooSyncModule {}
