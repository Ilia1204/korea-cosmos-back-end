import { ForbiddenException, Injectable } from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { WooReviewDto } from './woo-review.dto'
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
		const purchased = await this.queries.hasPurchased(userId, dto.wooProductId)
		if (!purchased)
			throw new ForbiddenException('Отзыв доступен только после покупки товара')

		const user = await this.userService.getById(userId)

		if (isSpam(dto.message, user.name ?? undefined))
			throw new ForbiddenException('Отзыв не прошёл проверку')

		const review = await this.prisma.wooReview.create({
			data: {
				message: dto.message,
				rating: dto.rating,
				images: dto.images ?? [],
				wooProductId: dto.wooProductId,
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
				{ reviewId: review.id, isRead: true }
			)
		}, 2000)

		return review
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
				{ reviewId: review.id, isRead: true }
			)
		}, 2000)

		return review
	}

	async reject(id: string, reason?: string) {
		const review = await this.prisma.wooReview.update({
			where: { id },
			data: { isPublic: false, wooStatus: 'hold', rejectReason: reason ?? null }
		})

		if (review.wooReviewId) {
			this.woo.updateStatus(review.wooReviewId, 'hold').catch(() => {})
		}

		const body = reason
			? `Причина: ${reason}`
			: 'К сожалению, ваш отзыв не прошёл модерацию.'

		setTimeout(() => {
			this.notifications.sendPushNotificationToUser(
				review.userId,
				'⛔ Отзыв отклонён',
				body,
				{ reviewId: review.id, isRead: true }
			)
		}, 2000)

		return review
	}

	async spam(id: string) {
		const review = await this.prisma.wooReview.update({
			where: { id },
			data: { isPublic: false, wooStatus: 'spam' }
		})

		if (review.wooReviewId) {
			this.woo.updateStatus(review.wooReviewId, 'spam').catch(() => {})
		}

		return review
	}

	async trash(id: string) {
		const review = await this.prisma.wooReview.update({
			where: { id },
			data: { isPublic: false, wooStatus: 'trash' }
		})

		if (review.wooReviewId) {
			this.woo.updateStatus(review.wooReviewId, 'trash').catch(() => {})
		}

		return review
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
				{ wooReviewId: String(wooReviewId), isRead: true }
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
}
