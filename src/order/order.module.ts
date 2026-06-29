import { Module } from '@nestjs/common'
import { DeliveryModule } from 'src/delivery/delivery.module'
import { LoyaltyLevelModule } from 'src/loyalty-level/loyalty-level.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { RetailCRMSyncModule } from 'src/retailcrm-sync/retailcrm-sync.module'
import { RobokassaService } from 'src/robokassa/robokassa.service'
import { UserService } from 'src/user/user.service'
import { WooSyncModule } from 'src/woo-sync/woo-sync.module'
import { AuditService } from 'src/audit/audit.service'
import { OrderController } from './order.controller'
import { OrderService } from './order.service'
import { OrderWooService } from './order-woo.service'

@Module({
	imports: [
		NotificationsModule,
		WooSyncModule,
		RetailCRMSyncModule,
		LoyaltyLevelModule,
		DeliveryModule
	],
	controllers: [OrderController],
	providers: [OrderService, OrderWooService, PrismaService, UserService, RobokassaService, AuditService],
	exports: [OrderService]
})
export class OrderModule {}
