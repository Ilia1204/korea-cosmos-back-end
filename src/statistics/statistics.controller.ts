import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	Patch,
	Query
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { StatisticsService } from './statistics.service'
import { StatisticsTabsService } from './statistics-tabs.service'
import { AdminOrdersService } from './admin-orders.service'

@Controller('statistics')
export class StatisticsController {
	constructor(
		private readonly statisticsService: StatisticsService,
		private readonly tabsService: StatisticsTabsService,
		private readonly adminOrdersService: AdminOrdersService
	) {}

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
		return this.tabsService.getOrdersTab()
	}

	@Get('/products-tab')
	@Auth('admin')
	getProductsTab() {
		return this.tabsService.getProductsTab()
	}

	@Get('/customers-tab')
	@Auth('admin')
	getCustomersTab() {
		return this.tabsService.getCustomersTab()
	}

	@Get('/registrations-by-month')
	@Auth('admin')
	getRegistrationsByMonth() {
		return this.tabsService.getUserRegistrationsByMonth()
	}

	@Get('/retail-order/:id')
	@Auth('admin')
	getRetailOrder(@Param('id', ParseIntPipe) id: number) {
		return this.adminOrdersService.getRetailOrder(id)
	}

	@Get('/admin-orders')
	@Auth('admin')
	getAdminOrders(
		@Query('search') search?: string,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number
	) {
		return this.adminOrdersService.getAdminOrders(search, page)
	}

	@Patch('/retail-order/:id/status')
	@HttpCode(200)
	@Auth('admin')
	updateRetailOrderStatus(
		@Param('id', ParseIntPipe) id: number,
		@Body('status') status: string
	) {
		return this.adminOrdersService.updateRetailOrderStatus(id, status)
	}
}
