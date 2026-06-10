import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { RetailCRMSyncService } from './retailcrm-sync.service'

@Module({
	imports: [ConfigModule, NotificationsModule],
	providers: [RetailCRMSyncService, PrismaService],
	exports: [RetailCRMSyncService]
})
export class RetailCRMSyncModule {}
