import { Module } from '@nestjs/common'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { WooSyncService } from './woo-sync.service'

@Module({
	imports: [NotificationsModule],
	providers: [WooSyncService, PrismaService]
})
export class WooSyncModule {}
