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
import { CarouselService } from './carousel.service'
import { CarouselDto } from './dto/carousel.dto'
import { UpdateOrderDto } from './dto/update-order.dto'

@Controller('carousel')
export class CarouselController {
	constructor(private readonly carouselService: CarouselService) {}

	@Get()
	async getAll(@Query('searchTerm') searchTerm?: string) {
		return this.carouselService.getAll(searchTerm)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Post()
	@Auth('admin')
	async create() {
		return this.carouselService.create()
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put('update-order')
	@Auth()
	updateOrder(@Body() updateOrderDto: UpdateOrderDto) {
		return this.carouselService.updateOrder(updateOrderDto.ids)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth()
	async update(@Param('id') id: string, @Body() dto: CarouselDto) {
		return this.carouselService.update(id, dto)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async deleteCategory(@Param('id') id: string) {
		return this.carouselService.delete(id)
	}

	@HttpCode(200)
	@Get(':id')
	@Auth('admin')
	async getCarouselById(@Param('id') id: string) {
		return this.carouselService.getById(id)
	}
}
