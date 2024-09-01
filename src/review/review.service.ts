import { Injectable, NotFoundException } from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { ProductService } from 'src/product/product.service'
import { returnFullestReviewObject } from './return-review.object'
import { ReviewDto } from './review.dto'

@Injectable()
export class ReviewService {
	constructor(
		private prisma: PrismaService,
		private productService: ProductService,
		private notificationService: NotificationsService
	) {}

	async getById(id: string) {
		return this.prisma.review.findUnique({
			where: { id },
			select: {
				...returnFullestReviewObject,
				user: {
					select: {
						id: true,
						name: true
					}
				},
				product: {
					select: {
						name: true,
						slug: true
					}
				}
			}
		})
	}

	async getAll(searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm)

		return this.prisma.review.findMany({
			orderBy: {
				createdAt: 'desc'
			},
			select: {
				...returnFullestReviewObject,
				user: {
					select: {
						id: true,
						name: true
					}
				},
				product: {
					select: {
						name: true,
						slug: true
					}
				}
			}
		})
	}

	private async search(searchTerm: string) {
		return await this.prisma.review.findMany({
			where: {
				OR: [
					{
						message: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						user: {
							name: {
								contains: searchTerm,
								mode: 'insensitive'
							}
						}
					},
					{
						product: {
							name: {
								contains: searchTerm,
								mode: 'insensitive'
							}
						}
					}
				]
			},
			select: returnFullestReviewObject
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

		setTimeout(async () => {
			await this.notificationService.sendPushNotificationToAdmins(
				'📝 Пользователь оставил отзыв!',
				`Новый отзыв ожидает публикации`,
				{ reviewId: review.id, isRead: true }
			)
		}, 2000)

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

		const updatedReview = await this.prisma.review.update({
			where: { id },
			data: {
				message: dto.message,
				images: dto.images,
				rating: dto.rating,
				isPublic: dto.isPublic,
				createdAt: dto.createdAt
			}
		})

		const averageRating = await this.getAverageValueByProductId(
			review.productId
		)

		await this.productService.updateProductRating(
			updatedReview.productId,
			averageRating.rating
		)

		if (updatedReview.isPublic) {
			await this.productService.updateReviewsCount(updatedReview.productId)

			setTimeout(async () => {
				await this.notificationService.sendPushNotificationToUser(
					updatedReview.userId,
					'✅ Отзыв опубликован',
					'Поздравляем! Ваш отзыв был принят и опубликован!',
					{ reviewUserId: updatedReview.id, isRead: true }
				)
			}, 2000)

			await this.notificationService.saveNotification(
				updatedReview.userId,
				'✅ Отзыв опубликован',
				'Поздравляем! Ваш отзыв был принят и опубликован!',
				{ reviewUserId: updatedReview.id }
			)
		} else if (!updatedReview.isPublic) {
			setTimeout(async () => {
				await this.notificationService.sendPushNotificationToUser(
					updatedReview.userId,
					'⛔ Отзыв отклонён',
					'⛔ Ваш отзыв был отклонён к публикации',
					{ reviewUserId: updatedReview.id, isRead: true }
				)
			}, 2000)

			await this.notificationService.saveNotification(
				updatedReview.userId,
				'⛔ Отзыв отклонён',
				'Ваш отзыв был отклонён к публикации',
				{ reviewUserId: updatedReview.id }
			)
		}
	}

	async delete(id: string) {
		const review = await this.getById(id)
		if (!review) throw new NotFoundException('Отзыв не найден')

		return this.prisma.review.delete({
			where: { id }
		})
	}
}
