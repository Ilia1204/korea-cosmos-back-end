import { Injectable } from '@nestjs/common'
import { WooApiClient } from 'src/woo-sync/woo-api.client'

const TTL_MS = {
	products: 3 * 60 * 1000,
	product: 5 * 60 * 1000,
	categories: 15 * 60 * 1000,
	tags: 30 * 60 * 1000,
	coupons: 3 * 60 * 1000,
	reviews: 2 * 60 * 1000,
	variations: 5 * 60 * 1000
}

@Injectable()
export class WooProxyService {
	private readonly cache = new Map<string, { data: any; expires: number }>()

	constructor(private readonly woo: WooApiClient) {}

	private hit<T>(key: string): T | null {
		const entry = this.cache.get(key)
		if (entry && entry.expires > Date.now()) return entry.data as T
		return null
	}

	private store(key: string, data: any, ttlMs: number) {
		this.cache.set(key, { data, expires: Date.now() + ttlMs })
	}

	async proxyList(path: string, params: Record<string, string>, ttlMs: number) {
		const key = `${path}?${new URLSearchParams(params).toString()}`
		const cached = this.hit(key)
		if (cached) return cached

		const res = await this.woo.get(path, params)
		if (!res.ok) return []
		const data = await res.json()
		this.store(key, data, ttlMs)
		return data
	}

	async proxyOne(path: string, ttlMs: number) {
		const cached = this.hit(path)
		if (cached) return cached

		const res = await this.woo.get(path)
		if (!res.ok) return null
		const data = await res.json()
		this.store(path, data, ttlMs)
		return data
	}

	async proxyPaginated(params: Record<string, string>) {
		const key = `paginated?${new URLSearchParams(params).toString()}`
		const cached = this.hit<any>(key)
		if (cached) return cached

		const res = await this.woo.get('products', params)
		if (!res.ok) return { data: [], totalPages: 1, total: 0 }
		const data = await res.json()
		const totalPages = parseInt(res.headers.get('x-wp-totalpages') ?? '1')
		const total = parseInt(res.headers.get('x-wp-total') ?? '0')
		const result = { data, totalPages, total }
		this.store(key, result, TTL_MS.products)
		return result
	}

	async postReview(body: any) {
		const res = await this.woo.post('products/reviews', body)
		return res.json()
	}

	get ttl() {
		return TTL_MS
	}
}
