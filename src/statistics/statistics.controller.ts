import { Controller, Get, Query } from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { StatisticsService } from './statistics.service'

@Controller('statistics')
export class StatisticsController {
	constructor(private readonly statisticsService: StatisticsService) {}

	@Get('/registrations-by-month')
	@Auth('admin')
	getRegistrationsByMonth() {
		return this.statisticsService.getUserRegistrationsByMonth()
	}

	@Get('main')
	@Auth('admin')
	getMainStatistics() {
		return this.statisticsService.getMain()
	}

	@Get('/numbers')
	@Auth('admin')
	getNumbers() {
		return this.statisticsService.getNumbers()
	}

	@Get('/retailcrm')
	@Auth('admin')
	getRetailCRMStats(@Query('period') period: 'week' | 'month' | 'quarter') {
		return this.statisticsService.getRetailCRMStats(period || 'month')
	}

	@Get('/orders-tab')
	@Auth('admin')
	getOrdersTab() {
		return this.statisticsService.getOrdersTab()
	}

	@Get('/products-tab')
	@Auth('admin')
	getProductsTab() {
		return this.statisticsService.getProductsTab()
	}

	@Get('/customers-tab')
	@Auth('admin')
	getCustomersTab() {
		return this.statisticsService.getCustomersTab()
	}
}
