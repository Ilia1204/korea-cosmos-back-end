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
import { LabelProductDto } from './label-product.dto'
import { LabelProductService } from './label-product.service'

@Controller('label-product')
export class LabelProductController {
	constructor(private readonly labelProductService: LabelProductService) {}

	@Get()
	async getAll() {
		return this.labelProductService.getAll()
	}

	@Get('by-slug/:slug')
	async getBySlug(@Param('slug') slug: string) {
		return this.labelProductService.getBySlug(slug)
	}

	@Get(':id')
	async getById(@Param('id') id: string) {
		return this.labelProductService.getById(id)
	}

	@HttpCode(200)
	@Post()
	@Auth('admin')
	async create() {
		return this.labelProductService.create()
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async update(@Param('id') id: string, @Body() dto: LabelProductDto) {
		return this.labelProductService.update(id, dto)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async delete(@Param('id') id: string) {
		return this.labelProductService.delete(id)
	}
}
