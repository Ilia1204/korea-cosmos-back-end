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
import { WooTagService } from './woo-tag.service'

@Controller('woo-tags')
export class WooTagController {
	constructor(private readonly service: WooTagService) {}

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
}
