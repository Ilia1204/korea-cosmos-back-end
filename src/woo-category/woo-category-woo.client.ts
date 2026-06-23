import { Injectable } from '@nestjs/common'
import axios from 'axios'

const CACHE_TTL = 5 * 60 * 1000

@Injectable()
export class WooCategoryWooClient {
	private readonly api = axios.create({
		baseURL: `${process.env.WP_URL}/wp-json/wc/v3`,
		params: {
			consumer_key: process.env.WC_CONSUMER_KEY,
			consumer_secret: process.env.WC_CONSUMER_SECRET
		}
	})

	private cache: { data: any[]; ts: number } | null = null

	async fetchAllCategories(): Promise<any[]> {
		if (this.cache && Date.now() - this.cache.ts < CACHE_TTL)
			return this.cache.data
		try {
			const all: any[] = []
			let page = 1
			while (true) {
				const res = await this.api.get('/products/categories', {
					params: {
						per_page: 100,
						page,
						orderby: 'name',
						order: 'asc',
						hide_empty: false
					}
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

	async fetchProductsByCategory(
		categoryId: number,
		perPage = 30
	): Promise<any[]> {
		try {
			const res = await this.api.get('/products', {
				params: { category: categoryId, per_page: perPage, status: 'publish' }
			})
			return res.data || []
		} catch {
			return []
		}
	}

	invalidateCache() {
		this.cache = null
	}
}
