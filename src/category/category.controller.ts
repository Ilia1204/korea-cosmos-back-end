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
import { CategoryDto } from './category.dto'
import { CategoryService } from './category.service'

@Controller('categories')
@UsePipes(new ValidationPipe())
export class CategoryController {
	constructor(private readonly categoryService: CategoryService) {}

	@Get()
	async getAll(@Query('searchTerm') searchTerm?: string) {
		return this.categoryService.getAll(searchTerm)
	}

	@Get('similar/:id')
	async getSimilar(@Param('id') id: string) {
		return this.categoryService.getSimilar(id)
	}

	@Get('by-slug/:slug')
	async getBySlug(@Param('slug') slug: string) {
		return this.categoryService.getBySlug(slug)
	}

	@Get('by-section/:sectionSlug')
	async getBySection(
		@Param('sectionSlug') sectionSlug: string,
		@Query('searchTerm') searchTerm?: string
	) {
		return this.categoryService.getBySection(sectionSlug, searchTerm)
	}

	@HttpCode(200)
	@Post()
	@Auth('admin')
	async create() {
		return this.categoryService.create()
	}

	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async update(@Param('id') id: string, @Body() dto: CategoryDto) {
		return this.categoryService.update(id, dto)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async delete(@Param('id') id: string) {
		return this.categoryService.delete(id)
	}

	@HttpCode(200)
	@Get(':id')
	@Auth('admin')
	async getById(@Param('id') id: string) {
		return this.categoryService.getById(id)
	}
}
