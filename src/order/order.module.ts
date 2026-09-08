import { Module, forwardRef } from '@nestjs/common'
import { DeliveryModule } from 'src/delivery/delivery.module'
import { LoyaltyLevelModule } from 'src/loyalty-level/loyalty-level.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { RetailCRMSyncModule } from 'src/retailcrm-sync/retailcrm-sync.module'
import { RobokassaModule } from 'src/robokassa/robokassa.module'
import { UserModule } from 'src/user/user.module'
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
		DeliveryModule,
		UserModule,
		forwardRef(() => RobokassaModule)
	],
	controllers: [OrderController],
	providers: [OrderService, OrderWooService, PrismaService, AuditService],
	exports: [OrderService]
})
export class OrderModule {}
