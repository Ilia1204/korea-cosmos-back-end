import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Post,
	Put,
	Query,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { PromoCodeDto } from './promocode.dto'
import { PromoCodeService } from './promocode.service'

@Controller('promocodes')
export class PromoCodeController {
	constructor(private readonly promoCodeService: PromoCodeService) {}

	@Get()
	async getAll(@Query('searchTerm') searchTerm?: string) {
		return this.promoCodeService.getAll(searchTerm)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Auth('admin')
	@Post()
	async createPromoCode() {
		return this.promoCodeService.create()
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async updatePromoCode(@Param('id') id: string, @Body() dto: PromoCodeDto) {
		return this.promoCodeService.update(id, dto)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async deletePromoCode(@Param('id') id: string) {
		return this.promoCodeService.delete(id)
	}

	@HttpCode(200)
	@Get(':id')
	@Auth('admin')
	async getPromocodeById(@Param('id') id: string) {
		return this.promoCodeService.getById(id)
	}
}
