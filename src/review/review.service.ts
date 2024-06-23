import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/prisma.service'
import { ProductService } from 'src/product/product.service'
import {
	returnFullestReviewObject,
	returnReviewObject
} from './return-review.object'
import { ReviewDto } from './review.dto'

@Injectable()
export class ReviewService {
	constructor(
		private prisma: PrismaService,
		private productService: ProductService
	) {}

	async getById(id: string) {
		return this.prisma.review.findUnique({
			where: { id },
			select: returnFullestReviewObject
		})
	}

	async getAll(
		isPublic = true,
		selectObject: Prisma.ReviewSelect = returnReviewObject
	) {
		return this.prisma.review.findMany({
			where: { isPublic },
			orderBy: {
				createdAt: 'desc'
			},
			select: selectObject
		})
	}

	async getAllByProductId(productId: string) {
		return this.prisma.review.findMany({
			where: { productId }
		})
	}

	async create(userId: string, dto: ReviewDto, productId: string) {
		const product = await this.productService.byId(productId)

		if (!product) throw new NotFoundException('Товар не найден')

		const review = await this.prisma.review.create({
			data: {
				...dto,
				product: {
					connect: {
						id: productId
					}
				},
				user: {
					connect: {
						id: userId
					}
				}
			}
		})

		const averageRating = await this.getAverageValueByProductId(productId)
		await this.productService.updateProductRating(
			productId,
			averageRating.rating
		)

		return review
	}

	async getAverageValueByProductId(productId: string) {
		return this.prisma.review
			.aggregate({
				where: { productId },
				_avg: { rating: true }
			})
			.then(data => data._avg)
	}

	async update(id: string, dto: ReviewDto) {
		const review = await this.getById(id)

		if (!review) throw new NotFoundException('Отзыв не найден')

		return this.prisma.review.update({
			where: { id },
			data: {
				message: dto.message,
				imagePath: dto.imagePath,
				rating: dto.rating,
				isPublic: dto.isPublic
			}
		})
	}

	async delete(id: string) {
		const review = await this.getById(id)
		if (!review) throw new NotFoundException('Отзыв не найден')

		return this.prisma.review.delete({
			where: {
				id
			}
		})
	}
}
