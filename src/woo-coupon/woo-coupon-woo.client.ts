import { Injectable } from '@nestjs/common'
import axios from 'axios'

const CACHE_TTL = 3 * 60 * 1000

@Injectable()
export class WooCouponWooClient {
	private readonly api = axios.create({
		baseURL: `${process.env.WP_URL}/wp-json/wc/v3`,
		params: {
			consumer_key: process.env.WC_CONSUMER_KEY,
			consumer_secret: process.env.WC_CONSUMER_SECRET
		}
	})

	private cache: { data: any[]; ts: number } | null = null

	async fetchAllCoupons(): Promise<any[]> {
		if (this.cache && Date.now() - this.cache.ts < CACHE_TTL)
			return this.cache.data
		try {
			const all: any[] = []
			let page = 1
			while (true) {
				const res = await this.api.get('/coupons', {
					params: { per_page: 100, page, orderby: 'date', order: 'desc' }
				})
				const batch: any[] = res.data || []
				all.push(...batch)
				if (batch.length < 100) break
				page++
			}
			this.cache = { data: all, ts: Date.now() }
			return all
		} catch {
			return this.cache?.data ?? []
		}
	}

	async fetchCouponById(id: number): Promise<any> {
		const res = await this.api.get(`/coupons/${id}`)
		return res.data
	}

	async createCoupon(data: object): Promise<any> {
		const res = await this.api.post('/coupons', data)
		this.cache = null
		return res.data
	}

	async updateCoupon(id: number, data: object): Promise<any> {
		const res = await this.api.put(`/coupons/${id}`, data)
		this.cache = null
		return res.data
	}

	async deleteCoupon(id: number): Promise<void> {
		await this.api.delete(`/coupons/${id}`, { params: { force: true } })
		this.cache = null
	}

	invalidateCache() {
		this.cache = null
	}
}
