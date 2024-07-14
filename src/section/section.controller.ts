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
import { SectionDto } from './section.dto'
import { SectionService } from './section.service'

@Controller('sections')
export class SectionController {
	constructor(private readonly sectionService: SectionService) {}

	@Get()
	async getAll(@Query('searchTerm') searchTerm?: string) {
		return this.sectionService.getAll(searchTerm)
	}

	@Get('by-slug/:slug')
	async getBySlug(@Param('slug') slug: string) {
		return this.sectionService.getBySlug(slug)
	}

	@Get(':id')
	async getById(@Param('id') id: string) {
		return this.sectionService.getById(id)
	}

	@HttpCode(200)
	@Post()
	@Auth('admin')
	async create() {
		return this.sectionService.create()
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async update(@Param('id') id: string, @Body() dto: SectionDto) {
		return this.sectionService.update(id, dto)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async delete(@Param('id') id: string) {
		return this.sectionService.delete(id)
	}
}
