import { Module } from '@nestjs/common'
import { LoyaltyLevelModule } from 'src/loyalty-level/loyalty-level.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { RetailCRMSyncModule } from 'src/retailcrm-sync/retailcrm-sync.module'
import { UserService } from 'src/user/user.service'
import { WooSyncModule } from 'src/woo-sync/woo-sync.module'
import { OrderService } from 'src/order/order.service'
import { RobokassaController } from './robokassa.controller'
import { RobokassaService } from './robokassa.service'

@Module({
	imports: [NotificationsModule, WooSyncModule, RetailCRMSyncModule, LoyaltyLevelModule],
	controllers: [RobokassaController],
	providers: [RobokassaService, PrismaService, UserService, OrderService],
	exports: [RobokassaService]
})
export class RobokassaModule {}
