import { Injectable } from '@nestjs/common'
import { EditWooReviewDto, WooReviewDto } from './woo-review.dto'
import { WooReviewModerationService } from './woo-review-moderation.service'
import { WooReviewQueriesService } from './woo-review-queries.service'

@Injectable()
export class WooReviewService {
	constructor(
		private readonly queries: WooReviewQueriesService,
		private readonly moderation: WooReviewModerationService
	) {}

	getById(id: string) {
		return this.queries.getById(id)
	}
	getAll(searchTerm?: string, page?: number) {
		return this.queries.getAll(searchTerm, page)
	}
	getByWooProductId(wooProductId: number) {
		return this.queries.getByWooProductId(wooProductId)
	}
	getBatchRatings(wooProductIds: number[]) {
		return this.queries.getBatchRatings(wooProductIds)
	}
	getAverageRating(wooProductId: number) {
		return this.queries.getAverageRating(wooProductId)
	}
	hasPurchased(userId: string, wooProductId: number) {
		return this.queries.hasPurchased(userId, wooProductId)
	}
	getMine(userId: string) {
		return this.queries.getMine(userId)
	}
	create(userId: string, dto: WooReviewDto) {
		return this.moderation.create(userId, dto)
	}
	updateOwn(id: string, userId: string, dto: EditWooReviewDto) {
		return this.moderation.updateOwn(id, userId, dto)
	}
	publish(id: string) {
		return this.moderation.publish(id)
	}
	reject(id: string, reason?: string) {
		return this.moderation.reject(id, reason)
	}
	spam(id: string) {
		return this.moderation.spam(id)
	}
	trash(id: string) {
		return this.moderation.trash(id)
	}

	getWooProductInfo(wooProductId: number) {
		return this.queries.getWooProductInfo(wooProductId)
	}
	updateMessage(id: string, message: string) {
		return this.moderation.updateMessage(id, message)
	}
	updateWooNativeMessage(wooReviewId: number, message: string) {
		return this.moderation.updateWooNativeMessage(wooReviewId, message)
	}
	updateRating(id: string, rating: number) {
		return this.moderation.updateRating(id, rating)
	}
	updateWooNativeRating(wooReviewId: number, rating: number) {
		return this.moderation.updateWooNativeRating(wooReviewId, rating)
	}
	autoTrashIfSpam(wooReviewId: number, text: string, reviewer: string) {
		return this.moderation.autoTrashIfSpam(wooReviewId, text, reviewer)
	}
	notifyAdminNewWooReview(
		wooReviewId: number,
		productName: string,
		reviewer: string
	) {
		return this.moderation.notifyAdminNewWooReview(
			wooReviewId,
			productName,
			reviewer
		)
	}
	publishWooNative(wooReviewId: number) {
		return this.moderation.publishWooNative(wooReviewId)
	}
	rejectWooNative(wooReviewId: number) {
		return this.moderation.rejectWooNative(wooReviewId)
	}
	spamWooNative(wooReviewId: number) {
		return this.moderation.setWooNativeStatus(wooReviewId, 'spam')
	}
	trashWooNative(wooReviewId: number) {
		return this.moderation.setWooNativeStatus(wooReviewId, 'trash')
	}
	delete(id: string) {
		return this.moderation.delete(id)
	}
}
