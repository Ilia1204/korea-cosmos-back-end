import { Injectable } from '@nestjs/common'
import axios from 'axios'

const CACHE_TTL = 2 * 60 * 1000 // 2 минуты

@Injectable()
export class WooReviewWooClient {
	private readonly api = axios.create({
		baseURL: `${process.env.WP_URL}/wp-json/wc/v3`,
		params: {
			consumer_key: process.env.WC_CONSUMER_KEY,
			consumer_secret: process.env.WC_CONSUMER_SECRET
		}
	})

	private reviewsCache = new Map<string, { data: any[]; ts: number }>()

	async fetchReviews(status: 'hold' | 'approved' | 'spam' | 'trash'): Promise<any[]> {
		const cached = this.reviewsCache.get(status)
		if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data
		try {
			const res = await this.api.get('/products/reviews', {
				params: { status, per_page: 100 }
			})
			const data = res.data || []
			this.reviewsCache.set(status, { data, ts: Date.now() })
			return data
		} catch {
			return cached?.data ?? []
		}
	}

	invalidateReviewsCache() {
		this.reviewsCache.clear()
	}

	async createReview(
		productId: number,
		review: string,
		rating: number,
		reviewer: string,
		reviewerEmail: string
	): Promise<number | null> {
		try {
			const res = await this.api.post('/products/reviews', {
				product_id: productId,
				review,
				rating,
				reviewer,
				reviewer_email: reviewerEmail,
				status: 'hold'
			})
			return res.data?.id ?? null
		} catch {
			return null
		}
	}

	async updateStatus(
		wooReviewId: number,
		status: 'approved' | 'hold' | 'spam' | 'trash'
	): Promise<void> {
		await this.api.put(`/products/reviews/${wooReviewId}`, { status })
		this.invalidateReviewsCache()
	}

	async updateText(wooReviewId: number, text: string): Promise<void> {
		await this.api.put(`/products/reviews/${wooReviewId}`, { review: text })
		this.invalidateReviewsCache()
	}

	async updateRating(wooReviewId: number, rating: number): Promise<void> {
		await this.api.put(`/products/reviews/${wooReviewId}`, { rating })
		this.invalidateReviewsCache()
	}

	async deleteReview(wooReviewId: number): Promise<void> {
		await this.api.delete(`/products/reviews/${wooReviewId}`, {
			params: { force: true }
		})
	}

	async fetchProduct(productId: number): Promise<{ name: string; slug: string; image: string | null } | null> {
		try {
			const res = await this.api.get(`/products/${productId}`)
			const d = res.data
			return {
				name: d.name ?? '',
				slug: d.slug ?? '',
				image: d.images?.[0]?.src ?? null
			}
		} catch {
			return null
		}
	}
}
