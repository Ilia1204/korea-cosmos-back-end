import { Module } from '@nestjs/common'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { RetailCRMSyncService } from './retailcrm-sync.service'

@Module({
	imports: [NotificationsModule],
	providers: [RetailCRMSyncService, PrismaService]
})
export class RetailCRMSyncModule {}
