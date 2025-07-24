import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { WooReviewDto } from './woo-review.dto'

const wooApi = axios.create({
	baseURL: `${process.env.WP_URL}/wp-json/wc/v3`,
	params: {
		consumer_key: process.env.WC_CONSUMER_KEY,
		consumer_secret: process.env.WC_CONSUMER_SECRET
	}
})

@Injectable()
export class WooReviewService {
	constructor(
		private prisma: PrismaService,
		private userService: UserService,
		private notificationsService: NotificationsService
	) {}

	async getById(id: string) {
		return this.prisma.wooReview.findUnique({
			where: { id },
			select: {
				id: true,
				message: true,
				images: true,
				rating: true,
				isPublic: true,
				createdAt: true,
				wooProductId: true,
				wooReviewId: true,
				user: { select: { id: true, name: true, avatarPath: true } }
			}
		})
	}

	async getAll(searchTerm?: string) {
		// 1. Локальные отзывы из нашей БД
		const localReviews = await this.prisma.wooReview.findMany({
			where: searchTerm
				? {
						OR: [
							{ message: { contains: searchTerm, mode: 'insensitive' } },
							{ user: { name: { contains: searchTerm, mode: 'insensitive' } } }
						]
					}
				: {},
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				message: true,
				images: true,
				rating: true,
				isPublic: true,
				createdAt: true,
				wooProductId: true,
				wooReviewId: true,
				user: { select: { id: true, name: true } }
			}
		})

		// Набор wooReviewId уже добавленных из локальной БД — для дедубликации
		const localWooIds = new Set(
			localReviews.map(r => r.wooReviewId).filter(Boolean)
		)

		// 2. Отзывы напрямую из WooCommerce (только hold и approved, без spam/trash)
		let wooReviews: any[] = []
		try {
			const [holdRes, approvedRes] = await Promise.all([
				wooApi.get('/products/reviews', { params: { status: 'hold', per_page: 100 } }),
				wooApi.get('/products/reviews', { params: { status: 'approved', per_page: 100 } })
			])
			wooReviews = [...(holdRes.data || []), ...(approvedRes.data || [])]
		} catch {
			// Если WooCommerce недоступен — показываем только локальные
		}

		// 3. Добавляем WooCommerce-only отзывы (которых нет в локальной БД)
		const wooOnlyReviews = wooReviews
			.filter(r => !localWooIds.has(r.id))
			.map(r => ({
				id: `woo-${r.id}`,
				message: r.review?.replace(/<[^>]*>/g, '') ?? '',
				images: [],
				rating: r.rating,
				isPublic: r.status === 'approved',
				createdAt: r.date_created,
				wooProductId: r.product_id,
				wooReviewId: r.id,
				source: 'woocommerce' as const,
				user: { id: null, name: r.reviewer }
			}))

		const allReviews = [
			...localReviews.map(r => ({ ...r, source: 'local' as const })),
			...wooOnlyReviews
		].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

		// Фильтрация по searchTerm для WooCommerce-отзывов (локальные уже отфильтрованы)
		if (searchTerm) {
			return allReviews.filter(r =>
				r.source === 'local' ||
				r.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
				r.user.name.toLowerCase().includes(searchTerm.toLowerCase())
			)
		}

		return allReviews
	}

	async getByWooProductId(wooProductId: number) {
		return this.prisma.wooReview.findMany({
			where: { wooProductId, isPublic: true },
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				message: true,
				images: true,
				rating: true,
				createdAt: true,
				wooProductId: true,
				user: {
					select: { id: true, name: true, avatarPath: true }
				}
			}
		})
	}

	async getBatchRatings(wooProductIds: number[]) {
		// Локальные опубликованные отзывы
		const localGroups = await this.prisma.wooReview.groupBy({
			by: ['wooProductId'],
			where: { wooProductId: { in: wooProductIds }, isPublic: true },
			_avg: { rating: true },
			_count: { id: true }
		})

		// Все WooCommerce approved отзывы одним запросом, группируем на бэке
		const wooCountByProduct: Record<number, number> = {}
		const wooRatingSumByProduct: Record<number, number> = {}
		const wooRatedCountByProduct: Record<number, number> = {}
		try {
			const wooRes = await wooApi.get('/products/reviews', {
				params: { status: 'approved', per_page: 100 }
			})
			for (const r of wooRes.data || []) {
				const pid: number = r.product_id
				if (!wooProductIds.includes(pid)) continue
				wooCountByProduct[pid] = (wooCountByProduct[pid] || 0) + 1
				if (r.rating > 0) {
					wooRatingSumByProduct[pid] = (wooRatingSumByProduct[pid] || 0) + r.rating
					wooRatedCountByProduct[pid] = (wooRatedCountByProduct[pid] || 0) + 1
				}
			}
		} catch {}

		// Объединяем
		const result: Record<number, { rating: number; count: number }> = {}
		const allIds = new Set([
			...localGroups.map(r => r.wooProductId),
			...Object.keys(wooCountByProduct).map(Number)
		])

		for (const id of allIds) {
			const local = localGroups.find(r => r.wooProductId === id)
			const localCount = local?._count.id ?? 0
			const localRatingSum = (local?._avg.rating ?? 0) * localCount
			const wooCount = wooCountByProduct[id] ?? 0
			const wooRatingSum = wooRatingSumByProduct[id] ?? 0
			const wooRatedCount = wooRatedCountByProduct[id] ?? 0
			const totalRatedCount = localCount + wooRatedCount
			const avgRating = totalRatedCount > 0
				? (localRatingSum + wooRatingSum) / totalRatedCount
				: 0

			result[id] = {
				rating: Math.round(avgRating * 10) / 10,
				count: localCount + wooCount
			}
		}

		return result
	}

	async getAverageRating(wooProductId: number) {
		const result = await this.prisma.wooReview.aggregate({
			where: { wooProductId, isPublic: true },
			_avg: { rating: true },
			_count: { id: true }
		})
		return {
			rating: Math.round((result._avg.rating ?? 0) * 10) / 10,
			count: result._count.id
		}
	}

	async create(userId: string, dto: WooReviewDto) {
		const user = await this.userService.getById(userId)

		// Сохраняем в локальную БД
		const review = await this.prisma.wooReview.create({
			data: {
				message: dto.message,
				rating: dto.rating,
				images: dto.images ?? [],
				wooProductId: dto.wooProductId,
				user: { connect: { id: userId } }
			}
		})

		// Дублируем в WooCommerce и сохраняем их ID
		this.sendToWooCommerce(
			dto.wooProductId,
			dto.message,
			dto.rating,
			user.name || 'Покупатель',
			user.email
		)
			.then(wooReviewId => {
				if (wooReviewId) {
					this.prisma.wooReview
						.update({
							where: { id: review.id },
							data: { wooReviewId }
						})
						.catch(() => {})
				}
			})
			.catch(() => {})

		setTimeout(async () => {
			await this.notificationsService.sendPushNotificationToAdmins(
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
			data: { isPublic: true }
		})

		// Одновременно публикуем в WooCommerce если есть их ID
		if (review.wooReviewId) {
			this.updateWooStatus(review.wooReviewId, 'approved').catch(() => {})
		}

		setTimeout(async () => {
			await this.notificationsService.sendPushNotificationToUser(
				review.userId,
				'✅ Отзыв опубликован',
				'Ваш отзыв был принят и опубликован!',
				{ reviewId: review.id, isRead: true }
			)
		}, 2000)

		return review
	}

	async reject(id: string) {
		const review = await this.prisma.wooReview.update({
			where: { id },
			data: { isPublic: false }
		})

		if (review.wooReviewId) {
			this.updateWooStatus(review.wooReviewId, 'hold').catch(() => {})
		}

		setTimeout(async () => {
			await this.notificationsService.sendPushNotificationToUser(
				review.userId,
				'⛔ Отзыв отклонён',
				'Ваш отзыв был отклонён к публикации',
				{ reviewId: review.id, isRead: true }
			)
		}, 2000)

		return review
	}

	// Управление WooCommerce-нативными отзывами (не из мобилки)
	async publishWooNative(wooReviewId: number) {
		await this.updateWooStatus(wooReviewId, 'approved')
	}

	async rejectWooNative(wooReviewId: number) {
		await this.updateWooStatus(wooReviewId, 'hold')
	}

	async delete(id: string) {
		const review = await this.prisma.wooReview.findUnique({ where: { id } })
		if (review?.wooReviewId) {
			this.deleteFromWoo(review.wooReviewId).catch(() => {})
		}
		return this.prisma.wooReview.delete({ where: { id } })
	}

	private async sendToWooCommerce(
		productId: number,
		review: string,
		rating: number,
		reviewer: string,
		reviewerEmail: string
	): Promise<number | null> {
		try {
			const response = await wooApi.post('/products/reviews', {
				product_id: productId,
				review,
				rating,
				reviewer,
				reviewer_email: reviewerEmail,
				status: 'hold'
			})
			return response.data?.id ?? null
		} catch {
			return null
		}
	}

	private async updateWooStatus(wooReviewId: number, status: 'approved' | 'hold') {
		await wooApi.put(`/products/reviews/${wooReviewId}`, { status })
	}

	private async deleteFromWoo(wooReviewId: number) {
		await wooApi.delete(`/products/reviews/${wooReviewId}`, {
			params: { force: true }
		})
	}
}
