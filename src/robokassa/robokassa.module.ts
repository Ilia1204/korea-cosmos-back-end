import { Module, forwardRef } from '@nestjs/common'
import { DeliveryModule } from 'src/delivery/delivery.module'
import { LoyaltyLevelModule } from 'src/loyalty-level/loyalty-level.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { RetailCRMSyncModule } from 'src/retailcrm-sync/retailcrm-sync.module'
import { UserModule } from 'src/user/user.module'
import { WooSyncModule } from 'src/woo-sync/woo-sync.module'
import { OrderModule } from 'src/order/order.module'
import { AuditService } from 'src/audit/audit.service'
import { RobokassaController } from './robokassa.controller'
import { RobokassaService } from './robokassa.service'

@Module({
	imports: [
		NotificationsModule,
		WooSyncModule,
		RetailCRMSyncModule,
		LoyaltyLevelModule,
		DeliveryModule,
		UserModule,
		forwardRef(() => OrderModule)
	],
	controllers: [RobokassaController],
	providers: [RobokassaService, PrismaService, AuditService],
	exports: [RobokassaService]
})
export class RobokassaModule {}
