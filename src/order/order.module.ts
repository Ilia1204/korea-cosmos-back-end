import { Module } from '@nestjs/common'
import { LoyaltyLevelModule } from 'src/loyalty-level/loyalty-level.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { RetailCRMSyncModule } from 'src/retailcrm-sync/retailcrm-sync.module'
import { RobokassaService } from 'src/robokassa/robokassa.service'
import { UserService } from 'src/user/user.service'
import { WooSyncModule } from 'src/woo-sync/woo-sync.module'
import { OrderController } from './order.controller'
import { OrderService } from './order.service'

@Module({
	imports: [
		NotificationsModule,
		WooSyncModule,
		RetailCRMSyncModule,
		LoyaltyLevelModule
	],
	controllers: [OrderController],
	providers: [OrderService, PrismaService, UserService, RobokassaService]
})
export class OrderModule {}
