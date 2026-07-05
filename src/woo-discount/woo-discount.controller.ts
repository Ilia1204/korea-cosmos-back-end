import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard'
import { ApplyWooDiscountDto } from './woo-discount.dto'
import { WooDiscountService } from './woo-discount.service'

@Controller('woo-discount')
@UseGuards(JwtAuthGuard)
export class WooDiscountController {
	constructor(private readonly service: WooDiscountService) {}

	@Post('apply')
	applyDiscount(@Body() dto: ApplyWooDiscountDto) {
		return this.service.applyDiscount(dto)
	}

	@Delete('remove')
	removeDiscount(@Body() dto: Pick<ApplyWooDiscountDto, 'type' | 'ids'>) {
		return this.service.removeDiscount(dto)
	}
}
