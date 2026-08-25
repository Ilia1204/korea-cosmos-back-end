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
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { AuditService } from 'src/audit/audit.service'
import { AdminCustomersService } from './admin-customers.service'
import { AdminOrdersService } from './admin-orders.service'
import { StatisticsService } from './statistics.service'
import { StatisticsTabsService } from './statistics-tabs.service'

@Controller('statistics')
export class StatisticsController {
	constructor(
		private readonly statisticsService: StatisticsService,
		private readonly tabsService: StatisticsTabsService,
		private readonly adminOrdersService: AdminOrdersService,
		private readonly adminCustomersService: AdminCustomersService,
		private readonly auditService: AuditService
	) {}

	@Get('main')
	@Auth('manager')
	getMainStatistics() {
		return this.statisticsService.getMain()
	}

	@Get('/numbers')
	@Auth('manager')
	getNumbers() {
		return this.statisticsService.getNumbers()
	}

	@Get('/retailcrm')
	@Auth('manager')
	getRetailCRMStats(@Query('period') period: 'week' | 'month' | 'quarter') {
		return this.statisticsService.getRetailCRMStats(period || 'month')
	}

	@Get('/orders-tab')
	@Auth('manager')
	getOrdersTab() {
		return this.tabsService.getOrdersTab()
	}

	@Get('/products-tab')
	@Auth('manager')
	getProductsTab() {
		return this.tabsService.getProductsTab()
	}

	@Get('/customers-tab')
	@Auth('manager')
	getCustomersTab() {
		return this.tabsService.getCustomersTab()
	}

	@Get('/registrations-by-month')
	@Auth('manager')
	getRegistrationsByMonth() {
		return this.tabsService.getUserRegistrationsByMonth()
	}

	@Get('/retail-order/:id')
	@Auth('manager')
	getRetailOrder(@Param('id', ParseIntPipe) id: number) {
		return this.adminOrdersService.getRetailOrder(id)
	}

	@Get('/admin-orders')
	@Auth('manager')
	getAdminOrders(
		@Query('search') search?: string,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
		@Query('status') status?: string,
		@Query('period') period?: string,
		@Query('deliveryMethod') deliveryMethod?: string,
		@Query('source') source?: string
	) {
		return this.adminOrdersService.getAdminOrders(search, page, {
			status,
			period,
			deliveryMethod,
			source
		})
	}

	@Patch('/retail-order/:id/status')
	@HttpCode(200)
	@Auth('manager')
	async updateRetailOrderStatus(
		@Param('id', ParseIntPipe) id: number,
		@Body('status') status: string,
		@Body('prevStatus') prevStatus: string,
		@CurrentUser('id') actorId: string
	) {
		const result = await this.adminOrdersService.updateRetailOrderStatus(id, status)
		this.auditService.log({
			action: 'order.status',
			entity: 'Order',
			entityId: String(id),
			entityName: `RetailCRM #${id}`,
			actorId,
			before: prevStatus ? { status: prevStatus } : undefined,
			after: { status },
			revertible: false
		}).catch(() => null)
		return result
	}

	@Patch('/retail-orders/close-all')
	@HttpCode(200)
	@Auth('manager')
	async closeAllRetailOrders(@CurrentUser('id') actorId: string) {
		const result = await this.adminOrdersService.closeAllRetailOrders()
		for (const id of result.closedIds) {
			this.auditService.log({
				action: 'order.status',
				entity: 'Order',
				entityId: String(id),
				entityName: `RetailCRM #${id}`,
				actorId,
				before: { status: 'payed' },
				after: { status: 'received' },
				revertible: false
			}).catch(() => null)
		}
		return result
	}

	@Get('/customers')
	@Auth('manager')
	getCustomers(
		@Query('source') source = 'all',
		@Query('search') search?: string,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
		@Query('role') role?: string,
		@Query('hasOrders') hasOrders?: string
	) {
		return this.adminCustomersService.getCustomers(source, search, page, role, hasOrders)
	}

	@Get('/customers/retail-orders/:customerId')
	@Auth('manager')
	getRetailOrdersByCustomer(@Param('customerId', ParseIntPipe) customerId: number) {
		return this.adminCustomersService.getRetailOrdersByCustomer(customerId)
	}

	@Get('/customers/wc-orders/:email')
	@Auth('manager')
	getWcOrdersByEmail(@Param('email') email: string) {
		return this.adminCustomersService.getWcOrdersByEmail(decodeURIComponent(email))
	}

	@Patch('/customers/wc/:id')
	@HttpCode(200)
	@Auth('manager')
	updateWcCustomer(
		@Param('id', ParseIntPipe) id: number,
		@Body() body: { firstName?: string; lastName?: string; phone?: string }
	) {
		return this.adminCustomersService.updateWcCustomer(id, body)
	}

	@Patch('/customers/retail/:id')
	@HttpCode(200)
	@Auth('manager')
	updateRetailCustomer(
		@Param('id', ParseIntPipe) id: number,
		@Body() body: { firstName?: string; lastName?: string; phone?: string }
	) {
		return this.adminCustomersService.updateRetailCustomer(id, body)
	}

	@Get('/customers/wc-loyalty/:id')
	@Auth('manager')
	getWcCustomerLoyalty(@Param('id', ParseIntPipe) id: number) {
		return this.adminCustomersService.getWcCustomerLoyalty(id)
	}

	@Get('/customers/retail-loyalty/:id')
	@Auth('manager')
	getRetailCustomerLoyalty(@Param('id', ParseIntPipe) id: number) {
		return this.adminCustomersService.getRetailCustomerLoyalty(id)
	}
}
