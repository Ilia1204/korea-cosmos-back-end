import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { WooCouponDto } from './woo-coupon.dto'
import { WooCouponService } from './woo-coupon.service'

@Controller('woo-coupons')
@UsePipes(new ValidationPipe())
export class WooCouponController {
	constructor(private readonly service: WooCouponService) {}

	@Get()
	@Auth('admin')
	async getAll(@Query('search') search?: string) {
		return this.service.getAll(search)
	}

	@HttpCode(200)
	@Post('cache/invalidate')
	@Auth('admin')
	async invalidateCache() {
		this.service.invalidateCache()
		return { ok: true }
	}

	@Get(':id')
	@Auth('admin')
	async getById(@Param('id', ParseIntPipe) id: number) {
		return this.service.getById(id)
	}

	@HttpCode(200)
	@Post()
	@Auth('admin')
	async create(@Body() dto: WooCouponDto) {
		return this.service.create(dto)
	}

	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async update(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: WooCouponDto
	) {
		return this.service.update(id, dto)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async delete(@Param('id', ParseIntPipe) id: number) {
		return this.service.delete(id)
	}
}
