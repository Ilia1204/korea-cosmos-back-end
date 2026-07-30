import {
	Controller,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	Post,
	Query
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { WooCategoryService } from './woo-category.service'

@Controller('woo-categories')
export class WooCategoryController {
	constructor(private readonly service: WooCategoryService) {}

	@Get()
	@Auth('manager')
	async getAll(
		@Query('search') search?: string,
		@Query('parent') parentStr?: string
	) {
		const parent =
			parentStr !== undefined && parentStr !== ''
				? Number(parentStr)
				: undefined
		return this.service.getAll(search, parent)
	}

	@HttpCode(200)
	@Post('cache/invalidate')
	@Auth('manager')
	async invalidateCache() {
		this.service.invalidateCache()
		return { ok: true }
	}

	@Get(':id')
	@Auth('manager')
	async getById(@Param('id', ParseIntPipe) id: number) {
		return this.service.getById(id)
	}
}
