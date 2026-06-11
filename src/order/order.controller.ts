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
import { OrderDto, UpdateOrderDto } from './dto/order.dto'
import { OrderService } from './order.service'

@Controller('orders')
export class OrderController {
	constructor(private readonly orderService: OrderService) {}

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
	@Auth('admin')
	getAll() {
		return this.orderService.getAll()
	}

	@Get('coupon/validate')
	@Auth()
	validateCoupon(@Query('code') code: string) {
		return this.orderService.validateWooCoupon(code)
	}

	@Get('by-user')
	@Auth()
	async getByUserId(@CurrentUser('id') userId: string) {
		return this.orderService.getByUserId(userId)
	}

	@Get('woocommerce')
	@Auth()
	getWooCommerceOrders(@CurrentUser('email') email: string) {
		return this.orderService.getWooCommerceOrders(email)
	}

	@Get('woocommerce/:wcId')
	@Auth()
	getWooCommerceOrder(@Param('wcId') wcId: string) {
		return this.orderService.getWooCommerceOrderById(wcId)
	}

	@Patch('woocommerce/:wcId/status')
	@HttpCode(200)
	@Auth('admin')
	updateWooCommerceOrderStatus(
		@Param('wcId', ParseIntPipe) wcId: number,
		@Body('status') status: string
	) {
		return this.orderService.updateWooCommerceOrderStatus(wcId, status)
	}

	@Get(':id')
	async getById(@Param('id') id: string) {
		return this.orderService.getById(id)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
		return this.orderService.update(id, dto)
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
