import { Module } from '@nestjs/common'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { WooSyncController } from './woo-sync.controller'
import { WooSyncService } from './woo-sync.service'

@Module({
	imports: [NotificationsModule],
	controllers: [WooSyncController],
	providers: [WooSyncService, PrismaService],
	exports: [WooSyncService]
})
export class WooSyncModule {}
