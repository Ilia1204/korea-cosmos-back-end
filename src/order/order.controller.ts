import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	Patch,
	Post,
	Put,
	Query,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { AuditService } from 'src/audit/audit.service'
import { OrderDto, UpdateOrderDto } from './dto/order.dto'
import { OrderService } from './order.service'
import { OrderWooService } from './order-woo.service'

@Controller('orders')
export class OrderController {
	constructor(
		private readonly orderService: OrderService,
		private readonly orderWoo: OrderWooService,
		private readonly auditService: AuditService
	) {}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Post('place')
	@Auth()
	async checkout(@Body() dto: OrderDto, @CurrentUser('id') userId: string) {
		return this.orderService.createPayment(dto, userId)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Auth()
	@Post(':orderId/payment-url')
	async payOrder(@Param('orderId') orderId: string) {
		return this.orderService.payOrder(orderId)
	}

	@Get()
	@Auth('manager')
	getAll() {
		return this.orderService.getAll()
	}

	@Get('coupon/validate')
	@Auth()
	validateCoupon(@Query('code') code: string) {
		return this.orderWoo.validateCoupon(code)
	}

	@Get('popular-products')
	getPopularProductIds(
		@Query('days') days?: string,
		@Query('minPrice') minPrice?: string,
		@Query('take') take?: string
	) {
		return this.orderService.getPopularProductIds(
			days ? parseInt(days) : 30,
			minPrice ? parseInt(minPrice) : 1000,
			take ? parseInt(take) : 8
		)
	}

	@Get('active-summary')
	@Auth()
	async getActiveOrdersSummary(@CurrentUser('id') userId: string) {
		return this.orderService.getActiveOrdersSummary(userId)
	}

	@Get('by-user')
	@Auth()
	async getByUserId(
		@CurrentUser('id') userId: string,
		@Query('page') page?: string,
		@Query('perPage') perPage?: string
	) {
		return this.orderService.getByUserId(
			userId,
			page ? parseInt(page) : 1,
			perPage ? parseInt(perPage) : 10
		)
	}

	@Get('woocommerce')
	@Auth()
	getWooCommerceOrders(@CurrentUser('email') email: string) {
		return this.orderWoo.getOrders(email)
	}

	@Get('woocommerce/:wcId')
	@Auth()
	getWooCommerceOrder(@Param('wcId') wcId: string) {
		return this.orderWoo.getOrderById(wcId)
	}

	@Patch('woocommerce/:wcId/status')
	@HttpCode(200)
	@Auth('manager')
	async updateWooCommerceOrderStatus(
		@Param('wcId', ParseIntPipe) wcId: number,
		@Body('status') status: string,
		@Body('prevStatus') prevStatus: string,
		@CurrentUser('id') actorId: string
	) {
		const result = await this.orderWoo.updateOrderStatus(wcId, status)
		this.auditService.log({
			action: 'order.status',
			entity: 'Order',
			entityId: String(wcId),
			entityName: `WooCommerce #${wcId}`,
			actorId,
			before: prevStatus ? { status: prevStatus } : undefined,
			after: { status },
			revertible: false
		}).catch(() => null)
		return result
	}

	@Get('admin/by-user/:userId')
	@Auth('manager')
	async getByUserIdAdmin(@Param('userId') userId: string) {
		return this.orderService.getByUserId(userId, 1, 1000)
	}

	@Get(':id')
	async getById(@Param('id') id: string) {
		return this.orderService.getById(id)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth('manager')
	async update(
		@Param('id') id: string,
		@Body() dto: UpdateOrderDto,
		@CurrentUser('id') actorId: string
	) {
		return this.orderService.update(id, dto, actorId)
	}

	@HttpCode(200)
	@Patch(':id/cancel')
	@Auth()
	async cancelOrder(
		@Param('id') id: string,
		@CurrentUser('id') userId: string,
		@Body('reason') reason?: string
	) {
		return this.orderService.cancelOrder(id, userId, reason)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async delete(@Param('id') id: string) {
		return this.orderService.delete(id)
	}
}
