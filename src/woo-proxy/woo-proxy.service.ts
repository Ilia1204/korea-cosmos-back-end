import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { WooApiClient } from 'src/woo-sync/woo-api.client'
import { WooCacheService } from './woo-cache.service'

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
	private readonly logger = new Logger(WooProxyService.name)

	constructor(
		private readonly woo: WooApiClient,
		private readonly cache: WooCacheService
	) {}

	@Cron('*/2 * * * *')
	async warmProductsCache() {
		try {
			await Promise.all([
				this.proxyList('products', { status: 'publish' }, TTL_MS.products),
				this.proxyPaginated({
					per_page: '30',
					page: '1',
					orderby: 'date',
					order: 'desc',
					status: 'publish',
					catalog_visibility: 'visible'
				})
			])
		} catch (err) {
			this.logger.warn(`[warmProductsCache] failed: ${err}`)
		}
	}

	@Cron(CronExpression.EVERY_10_MINUTES)
	async warmTaxonomyCache() {
		try {
			await Promise.all([
				this.proxyList(
					'products/categories',
					{ per_page: '100' },
					TTL_MS.categories
				),
				this.proxyList('products/tags', { per_page: '100' }, TTL_MS.tags)
			])
		} catch (err) {
			this.logger.warn(`[warmTaxonomyCache] failed: ${err}`)
		}
	}

	private hit<T>(key: string): T | null {
		return this.cache.hit<T>(key)
	}

	private store(key: string, data: any, ttlMs: number) {
		this.cache.store(key, data, ttlMs)
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
