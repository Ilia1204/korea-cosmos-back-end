import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Post,
	Put,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CategoryDto } from './category.dto'
import { CategoryService } from './category.service'

@Controller('categories')
export class CategoryController {
	constructor(private readonly categoryService: CategoryService) {}

	@Get()
	async getAll() {
		return this.categoryService.getAll()
	}

	@Get('similar/:id')
	async getSimilar(@Param('id') id: string) {
		return this.categoryService.getSimilar(id)
	}

	@Get('by-slug/:slug')
	async getCategoryBySlug(@Param('slug') slug: string) {
		return this.categoryService.getBySlug(slug)
	}

	@Get('by-section/:sectionSlug')
	async getCategoryBySection(@Param('sectionSlug') sectionSlug: string) {
		return this.categoryService.getBySection(sectionSlug)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Auth('admin')
	@Post()
	async createCategory() {
		return this.categoryService.create()
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async updateCategory(@Param('id') id: string, @Body() dto: CategoryDto) {
		return this.categoryService.update(id, dto)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async deleteCategory(@Param('id') id: string) {
		return this.categoryService.delete(id)
	}

	@HttpCode(200)
	@Get(':id')
	@Auth('admin')
	async getCategoryById(@Param('id') id: string) {
		return this.categoryService.getById(id)
	}
}
