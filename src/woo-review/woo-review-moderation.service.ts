import {
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { EditWooReviewDto, WooReviewDto } from './woo-review.dto'
import { WooReviewWooClient } from './woo-review-woo.client'
import { WooReviewQueriesService } from './woo-review-queries.service'

function isSpam(text: string, reviewer?: string): boolean {
	if (/https?:\/\//i.test(text)) return true
	if (/[؀-ۿݐ-ݿࢠ-ࣿ]/.test(text)) return true
	if (reviewer && (/^\d/.test(reviewer) || /888/.test(reviewer))) return true
	return false
}

@Injectable()
export class WooReviewModerationService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly woo: WooReviewWooClient,
		private readonly queries: WooReviewQueriesService,
		private readonly notifications: NotificationsService,
		private readonly userService: UserService
	) {}

	async create(userId: string, dto: WooReviewDto) {
		let orderId: string

		if (dto.orderId) {
			const order = await this.queries.getOrderForReview(
				userId,
				dto.wooProductId,
				dto.orderId
			)
			if (!order)
				throw new ForbiddenException(
					'Отзыв доступен только после получения заказа'
				)

			const existing = await this.prisma.wooReview.findUnique({
				where: {
					orderId_wooProductId: {
						orderId: order.id,
						wooProductId: dto.wooProductId
					}
				}
			})
			if (existing)
				throw new ForbiddenException(
					'Вы уже оставили отзыв на этот товар по этому заказу'
				)

			orderId = order.id
		} else {
			const [eligibleOrder] = await this.queries.findEligibleOrders(
				userId,
				dto.wooProductId
			)
			if (!eligibleOrder) {
				const purchased = await this.queries.hasPurchased(
					userId,
					dto.wooProductId
				)
				throw new ForbiddenException(
					purchased
						? 'Вы уже оставили отзыв на этот товар по всем своим заказам'
						: 'Отзыв доступен только после покупки товара'
				)
			}
			orderId = eligibleOrder.id
		}

		const user = await this.userService.getById(userId)

		if (isSpam(dto.message, user.name ?? undefined))
			throw new ForbiddenException('Отзыв не прошёл проверку')

		const review = await this.prisma.wooReview.create({
			data: {
				message: dto.message,
				rating: dto.rating,
				images: dto.images ?? [],
				wooProductId: dto.wooProductId,
				orderId,
				user: { connect: { id: userId } }
			}
		})

		this.woo
			.createReview(
				dto.wooProductId,
				dto.message,
				dto.rating,
				user.name || 'Покупатель',
				user.email
			)
			.then(wooReviewId => {
				if (wooReviewId) {
					this.prisma.wooReview
						.update({ where: { id: review.id }, data: { wooReviewId } })
						.catch(() => {})
				}
			})
			.catch(() => {})

		setTimeout(() => {
			this.notifications.sendPushNotificationToAdmins(
				'📝 Новый отзыв!',
				`Пользователь ${user.name} оставил отзыв`,
				{ reviewId: review.id, isRead: true },
				['admin']
			)
		}, 2000)

		return review
	}

	async updateOwn(id: string, userId: string, dto: EditWooReviewDto) {
		const review = await this.prisma.wooReview.findUnique({ where: { id } })
		if (!review) throw new NotFoundException('Отзыв не найден')
		if (review.userId !== userId)
			throw new ForbiddenException('Это не ваш отзыв')

		const user = await this.userService.getById(userId)

		if (isSpam(dto.message, user.name ?? undefined))
			throw new ForbiddenException('Отзыв не прошёл проверку')

		const updated = await this.prisma.wooReview.update({
			where: { id },
			data: {
				message: dto.message,
				rating: dto.rating,
				images: dto.images ?? review.images,
				isPublic: false,
				wooStatus: 'hold',
				rejectReason: null
			}
		})

		if (updated.wooReviewId) {
			this.woo.updateStatus(updated.wooReviewId, 'hold').catch(() => {})
			this.woo.updateText(updated.wooReviewId, dto.message).catch(() => {})
			this.woo.updateRating(updated.wooReviewId, dto.rating).catch(() => {})
		}

		setTimeout(() => {
			this.notifications.sendPushNotificationToAdmins(
				'📝 Отзыв отредактирован',
				`Пользователь ${user.name} изменил отзыв — нужна повторная модерация`,
				{ reviewId: updated.id, isRead: true },
				['admin']
			)
		}, 2000)

		setTimeout(() => {
			this.notifications.sendPushNotificationToUser(
				updated.userId,
				'📝 Отзыв отправлен на модерацию',
				'Вы изменили отзыв — он снова проверяется и скоро будет опубликован.',
				{ reviewId: updated.id, isRead: true },
				'orders'
			)
		}, 2000)

		return updated
	}

	async publish(id: string) {
		const review = await this.prisma.wooReview.update({
			where: { id },
			data: { isPublic: true, wooStatus: 'approved' }
		})

		if (review.wooReviewId) {
			this.woo.updateStatus(review.wooReviewId, 'approved').catch(() => {})
		}

		setTimeout(() => {
			this.notifications.sendPushNotificationToUser(
				review.userId,
				'✅ Отзыв опубликован',
				'Ваш отзыв опубликован — спасибо за обратную связь!',
				{ reviewId: review.id, isRead: true },
				'orders'
			)
		}, 2000)

		return review
	}

	async reject(id: string, reason?: string) {
		const before = await this.prisma.wooReview.findUnique({ where: { id } })
		const wasPublic = before?.isPublic ?? false

		const review = await this.prisma.wooReview.update({
			where: { id },
			data: { isPublic: false, wooStatus: 'hold', rejectReason: reason ?? null }
		})

		if (review.wooReviewId) {
			this.woo.updateStatus(review.wooReviewId, 'hold').catch(() => {})
		}

		if (wasPublic) {
			this.sendRevokedPush(review.userId)
		} else {
			const body = reason
				? `Причина: ${reason}`
				: 'К сожалению, ваш отзыв не прошёл модерацию.'

			setTimeout(() => {
				this.notifications.sendPushNotificationToUser(
					review.userId,
					'⛔ Отзыв отклонён',
					body,
					{ reviewId: review.id, isRead: true },
					'orders'
				)
			}, 2000)
		}

		return review
	}

	async spam(id: string) {
		const before = await this.prisma.wooReview.findUnique({ where: { id } })
		const wasPublic = before?.isPublic ?? false

		const review = await this.prisma.wooReview.update({
			where: { id },
			data: { isPublic: false, wooStatus: 'spam' }
		})

		if (review.wooReviewId) {
			this.woo.updateStatus(review.wooReviewId, 'spam').catch(() => {})
		}

		if (wasPublic) this.sendRevokedPush(review.userId)

		return review
	}

	async trash(id: string) {
		const before = await this.prisma.wooReview.findUnique({ where: { id } })
		const wasPublic = before?.isPublic ?? false

		const review = await this.prisma.wooReview.update({
			where: { id },
			data: { isPublic: false, wooStatus: 'trash' }
		})

		if (review.wooReviewId) {
			this.woo.updateStatus(review.wooReviewId, 'trash').catch(() => {})
		}

		if (wasPublic) this.sendRevokedPush(review.userId)

		return review
	}

	private sendRevokedPush(userId: string) {
		setTimeout(() => {
			this.notifications.sendPushNotificationToUser(
				userId,
				'⚠️ Отзыв снят с публикации',
				'Один из ваших отзывов был удалён из публичного доступа.',
				{ screen: 'MyReviews', isRead: true },
				'orders'
			)
		}, 2000)
	}

	async updateRating(id: string, rating: number) {
		const review = await this.prisma.wooReview.update({
			where: { id },
			data: { rating }
		})
		if (review.wooReviewId) {
			this.woo.updateRating(review.wooReviewId, rating).catch(() => {})
		}
		return review
	}

	async updateWooNativeRating(wooReviewId: number, rating: number) {
		await this.woo.updateRating(wooReviewId, rating)
	}

	async updateMessage(id: string, message: string) {
		const review = await this.prisma.wooReview.update({
			where: { id },
			data: { message }
		})
		if (review.wooReviewId) {
			this.woo.updateText(review.wooReviewId, message).catch(() => {})
		}
		return review
	}

	async updateWooNativeMessage(wooReviewId: number, message: string) {
		await this.woo.updateText(wooReviewId, message)
	}

	async autoTrashIfSpam(
		wooReviewId: number,
		text: string,
		reviewer: string
	): Promise<boolean> {
		if (!isSpam(text, reviewer)) return false
		await this.woo.updateStatus(wooReviewId, 'trash').catch(() => {})
		return true
	}

	async notifyAdminNewWooReview(
		wooReviewId: number,
		productName: string,
		reviewer: string
	) {
		setTimeout(() => {
			this.notifications.sendPushNotificationToAdmins(
				'📝 Новый отзыв с сайта!',
				`${reviewer} оставил отзыв на "${productName}"`,
				{ wooReviewId: String(wooReviewId), isRead: true },
				['admin']
			)
		}, 2000)
	}

	async publishWooNative(wooReviewId: number) {
		await this.woo.updateStatus(wooReviewId, 'approved')
	}

	async rejectWooNative(wooReviewId: number) {
		await this.woo.updateStatus(wooReviewId, 'hold')
	}

	async setWooNativeStatus(
		wooReviewId: number,
		status: 'approved' | 'hold' | 'spam' | 'trash'
	) {
		await this.woo.updateStatus(wooReviewId, status)
	}

	async delete(id: string) {
		const review = await this.prisma.wooReview.findUnique({ where: { id } })
		if (review?.wooReviewId) {
			this.woo.deleteReview(review.wooReviewId).catch(() => {})
		}
		return this.prisma.wooReview.delete({ where: { id } })
	}

	async deleteOwn(id: string, userId: string) {
		const review = await this.prisma.wooReview.findUnique({ where: { id } })
		if (!review) throw new NotFoundException('Отзыв не найден')
		if (review.userId !== userId)
			throw new ForbiddenException('Это не ваш отзыв')

		return this.delete(id)
	}
}
