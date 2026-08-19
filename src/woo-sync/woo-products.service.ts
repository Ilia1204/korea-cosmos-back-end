import { Injectable } from '@nestjs/common'
import { WooApiClient } from './woo-api.client'

const TAG_IDS = [21, 22, 23]
const TAG_NAMES: Record<number, string> = {
	21: 'Новинки',
	22: 'Хиты',
	23: 'Рекомендуем'
}
const TAG_SLUGS: Record<number, string> = {
	21: 'novinki',
	22: 'hity',
	23: 'rekomenduem'
}

const PRODUCT_FIELDS =
	'id,name,slug,price,regular_price,sale_price,on_sale,images,average_rating,rating_count,stock_status,categories,tags,meta_data,attributes,type,total_sales'

@Injectable()
export class WooProductsService {
	private labelProductsCache: { data: any; ts: number } | null = null
	private readonly LABEL_PRODUCTS_TTL = 30 * 60 * 1000

	constructor(private readonly woo: WooApiClient) {}

	async getLabelProducts() {
		if (this.labelProductsCache) {
			if (Date.now() - this.labelProductsCache.ts < this.LABEL_PRODUCTS_TTL) {
				return this.labelProductsCache.data
			}
			this.buildLabelProducts()
				.then(data => {
					if (data.every(tab => tab.products.length > 0)) {
						this.labelProductsCache = { data, ts: Date.now() }
					}
				})
				.catch(() => {})
			return this.labelProductsCache.data
		}
		const data = await this.buildLabelProducts()
		if (data.every(tab => tab.products.length > 0)) {
			this.labelProductsCache = { data, ts: Date.now() }
		}
		return data
	}

	async getProductsBySlugs(slugs: string[]) {
		if (!slugs.length) return []
		const res = await this.woo.get('products', {
			slug: slugs.join(','),
			per_page: '100',
			status: 'publish'
		})
		if (!res.ok) return []
		return res.json()
	}

	async getModifiedProducts(since: Date) {
		const results: any[] = []
		let page = 1

		while (true) {
			const res = await this.woo.get('products', {
				modified_after: since.toISOString(),
				orderby: 'modified',
				order: 'asc',
				per_page: '100',
				page: String(page),
				_fields: 'id,slug,stock_status'
			})
			if (!res.ok) break
			const batch = await res.json()
			if (!Array.isArray(batch) || !batch.length) break

			results.push(...batch)
			if (batch.length < 100) break
			page++
		}

		return results
	}

	private async buildLabelProducts() {
		const results = await Promise.all(
			TAG_IDS.map(tagId =>
				this.woo
					.get('products', {
						tag: String(tagId),
						per_page: '20',
						status: 'publish',
						catalog_visibility: 'visible',
						_fields: PRODUCT_FIELDS
					})
					.then(r => r.json())
					.catch(() => [])
			)
		)

		return TAG_IDS.map((tagId, i) => ({
			name: TAG_NAMES[tagId],
			slug: TAG_SLUGS[tagId],
			products: Array.isArray(results[i]) ? results[i] : []
		}))
	}
}
