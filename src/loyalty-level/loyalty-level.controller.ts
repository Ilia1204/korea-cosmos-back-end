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
export class LoyaltyLevelController {
	constructor(private readonly loyaltyLevelService: LoyaltyLevelService) {}

	@Get()
	@Auth('admin')
	async getAllLoyaltyLevels(@Query('searchTerm') searchTerm?: string) {
		return this.loyaltyLevelService.getAll(searchTerm)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Auth('admin')
	@Post()
	async createLoyaltyLevel(@Body() dto: LoyaltyLevelDto) {
		return this.loyaltyLevelService.create(dto)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async updateLoyaltyLevel(
		@Param('id') id: string,
		@Body() dto: UpdateLoyaltyLevelDto
	) {
		return this.loyaltyLevelService.update(id, dto)
	}

	@HttpCode(200)
	@Get(':id')
	@Auth('admin')
	async getLoyaltyLevelById(@Param('id') id: string) {
		return this.loyaltyLevelService.getById(id)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async deleteLoyaltyLevel(@Param('id') id: string) {
		return this.loyaltyLevelService.delete(id)
	}
}
