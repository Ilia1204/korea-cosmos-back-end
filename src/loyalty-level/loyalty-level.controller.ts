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
import { LoyaltyLevelDto, UpdateLoyaltyLevelDto } from './loyalty-level.dto'
import { LoyaltyLevelService } from './loyalty-level.service'

@Controller('loyalty-levels')
@UsePipes(new ValidationPipe())
export class LoyaltyLevelController {
	constructor(private readonly loyaltyLevelService: LoyaltyLevelService) {}

	@Get()
	@Auth()
	async getAll(@Query('searchTerm') searchTerm?: string) {
		return this.loyaltyLevelService.getAll(searchTerm)
	}

	@HttpCode(200)
	@Post()
	@Auth('admin')
	async create(@Body() dto: LoyaltyLevelDto) {
		return this.loyaltyLevelService.create(dto)
	}

	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async update(@Param('id') id: string, @Body() dto: UpdateLoyaltyLevelDto) {
		return this.loyaltyLevelService.update(id, dto)
	}

	@HttpCode(200)
	@Get(':id')
	@Auth('admin')
	async getById(@Param('id') id: string) {
		return this.loyaltyLevelService.getById(id)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async delete(@Param('id') id: string) {
		return this.loyaltyLevelService.delete(id)
	}
}
