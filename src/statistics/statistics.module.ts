import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaService } from 'src/prisma.service'
import { StatisticsController } from './statistics.controller'
import { StatisticsService } from './statistics.service'
import { StatisticsTabsService } from './statistics-tabs.service'
import { AdminOrdersService } from './admin-orders.service'
import { RetailCrmService } from './retail-crm.service'

@Module({
	imports: [ConfigModule],
	controllers: [StatisticsController],
	providers: [
		StatisticsService,
		StatisticsTabsService,
		AdminOrdersService,
		RetailCrmService,
		PrismaService
	]
})
export class StatisticsModule {}
