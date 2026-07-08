import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaService } from 'src/prisma.service'
import { WooSyncModule } from 'src/woo-sync/woo-sync.module'
import { AuditService } from 'src/audit/audit.service'
import { AdminCustomersService } from './admin-customers.service'
import { AdminOrdersService } from './admin-orders.service'
import { RetailCrmService } from './retail-crm.service'
import { StatisticsController } from './statistics.controller'
import { StatisticsService } from './statistics.service'
import { StatisticsTabsService } from './statistics-tabs.service'

@Module({
	imports: [ConfigModule, WooSyncModule],
	controllers: [StatisticsController],
	providers: [
		StatisticsService,
		StatisticsTabsService,
		AdminOrdersService,
		AdminCustomersService,
		RetailCrmService,
		PrismaService,
		AuditService
	]
})
export class StatisticsModule {}
