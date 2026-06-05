import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'

import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { WooReviewDto } from './woo-review.dto'
import { WooReviewService } from './woo-review.service'

@Controller('woo-reviews')
export class WooReviewController {
	constructor(private readonly wooReviewService: WooReviewService) {}

	// Публичные отзывы по товару
	@Get('by-product')
	async getByProduct(@Query('wooProductId', ParseIntPipe) wooProductId: number) {
		return this.wooReviewService.getByWooProductId(wooProductId)
	}

	// Все отзывы для админки
	@Get()
	@Auth('admin')
	async getAll(@Query('searchTerm') searchTerm?: string) {
		return this.wooReviewService.getAll(searchTerm)
	}

	@Get(':id')
	@Auth('admin')
	async getById(@Param('id') id: string) {
		return this.wooReviewService.getById(id)
	}

	@Get('rating')
	async getRating(@Query('wooProductId', ParseIntPipe) wooProductId: number) {
		return this.wooReviewService.getAverageRating(wooProductId)
	}

	// GET /woo-reviews/ratings/batch?ids=1,2,3
	@Get('ratings/batch')
	async getBatchRatings(@Query('ids') ids: string) {
		const wooProductIds = ids.split(',').map(Number).filter(Boolean)
		return this.wooReviewService.getBatchRatings(wooProductIds)
	}

	@Get('can-review/:wooProductId')
	@Auth()
	async canReview(
		@CurrentUser('id') userId: string,
		@Param('wooProductId', ParseIntPipe) wooProductId: number
	) {
		const canReview = await this.wooReviewService.hasPurchased(userId, wooProductId)
		return { canReview }
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Post('leave')
	@Auth()
	async leave(@CurrentUser('id') userId: string, @Body() dto: WooReviewDto) {
		return this.wooReviewService.create(userId, dto)
	}

	@HttpCode(200)
	@Put(':id/publish')
	@Auth('admin')
	async publish(@Param('id') id: string) {
		return this.wooReviewService.publish(id)
	}

	@HttpCode(200)
	@Put(':id/reject')
	@Auth('admin')
	async reject(@Param('id') id: string) {
		return this.wooReviewService.reject(id)
	}

	// Управление WooCommerce-нативными отзывами (добавленными с сайта, не из мобилки)
	@HttpCode(200)
	@Put('woo/:wooReviewId/publish')
	@Auth('admin')
	async publishWoo(@Param('wooReviewId', ParseIntPipe) wooReviewId: number) {
		return this.wooReviewService.publishWooNative(wooReviewId)
	}

	@HttpCode(200)
	@Put('woo/:wooReviewId/reject')
	@Auth('admin')
	async rejectWoo(@Param('wooReviewId', ParseIntPipe) wooReviewId: number) {
		return this.wooReviewService.rejectWooNative(wooReviewId)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async delete(@Param('id') id: string) {
		return this.wooReviewService.delete(id)
	}
}
