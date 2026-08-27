import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { WooReviewWooClient } from './woo-review-woo.client'

@Injectable()
export class WooReviewQueriesService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly woo: WooReviewWooClient
	) {}

	async getWooProductInfo(wooProductId: number) {
		return this.woo.fetchProduct(wooProductId)
	}

	private isWooSpam(text: string, reviewer?: string): boolean {
		if (/https?:\/\//i.test(text)) return true
		if (/[؀-ۿݐ-ݿࢠ-ࣿ]/.test(text)) return true
		if (reviewer && (/^\d/.test(reviewer) || /888/.test(reviewer))) return true
		return false
	}

	async getById(id: string) {
		const review = await this.prisma.wooReview.findUnique({
			where: { id },
			select: {
				id: true,
				message: true,
				images: true,
				rating: true,
				isPublic: true,
				wooStatus: true,
				rejectReason: true,
				createdAt: true,
				wooProductId: true,
				wooReviewId: true,
				user: { select: { id: true, name: true, avatarPath: true } }
			}
		})
		if (!review) return null
		const product = await this.woo.fetchProduct(review.wooProductId)
		return { ...review, product }
	}

	async getAll(searchTerm?: string, page = 1, limit = 20) {
		const textWhere = searchTerm
			? {
					OR: [
						{ message: { contains: searchTerm, mode: 'insensitive' as const } },
						{
							user: {
								name: { contains: searchTerm, mode: 'insensitive' as const }
							}
						}
					]
			  }
			: {}

		const [
			localReviews,
			holdReviews,
			approvedReviews,
			spamReviews,
			trashReviews
		] = await Promise.all([
			this.prisma.wooReview.findMany({
				where: textWhere,
				orderBy: { createdAt: 'desc' },
				select: {
					id: true,
					message: true,
					images: true,
					rating: true,
					isPublic: true,
					wooStatus: true,
					createdAt: true,
					wooProductId: true,
					wooReviewId: true,
					user: { select: { id: true, name: true } }
				}
			}),
			this.woo.fetchReviews('hold'),
			this.woo.fetchReviews('approved'),
			this.woo.fetchReviews('spam'),
			this.woo.fetchReviews('trash')
		])

		const localWooIds = new Set(
			localReviews.map(r => r.wooReviewId).filter(Boolean)
		)

		const wooOnlyReviews = [
			...holdReviews,
			...approvedReviews,
			...spamReviews,
			...trashReviews
		]
			.filter(r => !localWooIds.has(r.id))
			.map(r => {
				const text = r.review?.replace(/<[^>]*>/g, '') ?? ''
				const detectedSpam =
					r.status === 'hold' && this.isWooSpam(text, r.reviewer)
				if (detectedSpam) {
					this.woo.updateStatus(r.id, 'trash').catch(() => {})
				}
				return {
					id: `woo-${r.id}`,
					message: text,
					images: [],
					rating: r.rating,
					isPublic: r.status === 'approved',
					wooStatus: (detectedSpam ? 'trash' : r.status) as
						| 'approved'
						| 'hold'
						| 'spam'
						| 'trash',
					createdAt: r.date_created,
					wooProductId: r.product_id,
					wooReviewId: r.id,
					source: 'woocommerce' as const,
					user: { id: null as null, name: r.reviewer }
				}
			})

		let allReviews = [
			...localReviews.map(r => ({
				...r,
				source: 'local' as const,
				wooStatus: r.wooStatus as 'approved' | 'hold' | 'spam' | 'trash'
			})),
			...wooOnlyReviews
		].sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		)

		if (searchTerm) {
			allReviews = allReviews.filter(
				r =>
					r.source === 'local' ||
					r.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
					r.user.name.toLowerCase().includes(searchTerm.toLowerCase())
			)
		}

		const counts = {
			all: allReviews.length,
			pending: allReviews.filter(r => r.wooStatus === 'hold').length,
			approved: allReviews.filter(r => r.wooStatus === 'approved').length,
			spam: allReviews.filter(r => r.wooStatus === 'spam').length,
			trash: allReviews.filter(r => r.wooStatus === 'trash').length
		}

		const skip = (page - 1) * limit
		const reviews = allReviews.slice(skip, skip + limit)

		return { reviews, hasMore: skip + limit < allReviews.length, page, counts }
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
				user: { select: { id: true, name: true, avatarPath: true } }
			}
		})
	}

	async getBatchRatings(wooProductIds: number[]) {
		const localGroups = await this.prisma.wooReview.groupBy({
			by: ['wooProductId'],
			where: { wooProductId: { in: wooProductIds }, isPublic: true },
			_avg: { rating: true },
			_count: { id: true }
		})

		const wooCountByProduct: Record<number, number> = {}
		const wooRatingSumByProduct: Record<number, number> = {}
		const wooRatedCountByProduct: Record<number, number> = {}

		const approvedReviews = await this.woo.fetchReviews('approved')
		for (const r of approvedReviews) {
			const pid: number = r.product_id
			if (!wooProductIds.includes(pid)) continue
			wooCountByProduct[pid] = (wooCountByProduct[pid] || 0) + 1
			if (r.rating > 0) {
				wooRatingSumByProduct[pid] =
					(wooRatingSumByProduct[pid] || 0) + r.rating
				wooRatedCountByProduct[pid] = (wooRatedCountByProduct[pid] || 0) + 1
			}
		}

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
			const avgRating =
				totalRatedCount > 0
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

	async getMine(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { email: true }
		})

		const [reviews, approvedWooReviews] = await Promise.all([
			this.prisma.wooReview.findMany({
				where: { userId },
				orderBy: { createdAt: 'desc' },
				select: {
					id: true,
					message: true,
					images: true,
					rating: true,
					isPublic: true,
					wooStatus: true,
					rejectReason: true,
					createdAt: true,
					wooProductId: true,
					wooReviewId: true
				}
			}),

			user?.email ? this.woo.fetchReviews('approved') : Promise.resolve([])
		])

		const localWooIds = new Set(reviews.map(r => r.wooReviewId).filter(Boolean))
		const email = user?.email?.toLowerCase()

		const wooOnlyReviews = approvedWooReviews
			.filter(
				(r: any) =>
					email &&
					r.reviewer_email?.toLowerCase() === email &&
					!localWooIds.has(r.id)
			)
			.map((r: any) => ({
				id: `woo-${r.id}`,
				message: r.review?.replace(/<[^>]*>/g, '') ?? '',
				images: [] as string[],
				rating: r.rating || 5,
				isPublic: true,
				wooStatus: 'approved' as const,
				rejectReason: null as string | null,
				createdAt: r.date_created,
				wooProductId: r.product_id,
				wooReviewId: r.id
			}))

		const allReviews = [...reviews, ...wooOnlyReviews].sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		)

		return Promise.all(
			allReviews.map(async review => ({
				...review,
				product: await this.woo.fetchProduct(review.wooProductId)
			}))
		)
	}

	async hasPurchased(userId: string, wooProductId: number): Promise<boolean> {
		const order = await this.prisma.order.findFirst({
			where: {
				userId,
				status: 'delivered',
				items: { some: { productId: String(wooProductId) } }
			}
		})
		return !!order
	}

	async findEligibleOrders(userId: string, wooProductId: number) {
		const orders = await this.prisma.order.findMany({
			where: {
				userId,
				status: 'delivered',
				items: { some: { productId: String(wooProductId) } }
			},
			orderBy: { createdAt: 'desc' }
		})
		if (!orders.length) return []

		const reviewed = await this.prisma.wooReview.findMany({
			where: { orderId: { in: orders.map(o => o.id) }, wooProductId },
			select: { orderId: true }
		})
		const reviewedIds = new Set(reviewed.map(r => r.orderId))

		return orders.filter(o => !reviewedIds.has(o.id))
	}

	async getOrderForReview(
		userId: string,
		wooProductId: number,
		orderId: string
	) {
		return this.prisma.order.findFirst({
			where: {
				id: orderId,
				userId,
				status: 'delivered',
				items: { some: { productId: String(wooProductId) } }
			}
		})
	}
}
