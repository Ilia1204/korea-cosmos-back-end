import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { LoyaltyLevelModule } from 'src/loyalty-level/loyalty-level.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { WooSyncModule } from 'src/woo-sync/woo-sync.module'
import { RetailCRMSyncService } from './retailcrm-sync.service'

@Module({
	imports: [
		ConfigModule,
		NotificationsModule,
		LoyaltyLevelModule,
		WooSyncModule
	],
	providers: [RetailCRMSyncService, PrismaService],
	exports: [RetailCRMSyncService]
})
export class RetailCRMSyncModule {}
