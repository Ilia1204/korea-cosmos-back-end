import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { WooApiClient } from './woo-api.client'
import { WcProductQueryDto, WcProductUpdateDto } from './dto/wc-product-admin.dto'

const LIST_FIELDS =
	'id,name,slug,images,regular_price,sale_price,stock_status,status,categories,tags,type,date_created,short_description'

@Injectable()
export class WooProductAdminService {
	constructor(private readonly woo: WooApiClient) {}

	async getProducts(dto: WcProductQueryDto) {
		const params: Record<string, string> = {
			page: String(dto.page ?? 1),
			per_page: String(dto.per_page ?? 20),
			status: dto.status || 'any',
			_fields: LIST_FIELDS
		}
		if (dto.search) params.search = dto.search
		if (dto.category) params.category = String(dto.category)
		if (dto.tag) params.tag = String(dto.tag)
		if (dto.stock_status) params.stock_status = dto.stock_status
		if (dto.type) params.type = dto.type
		if (dto.on_sale) params.on_sale = 'true'

		const res = await this.woo.get('products', params)
		if (!res.ok) throw new BadRequestException('WC products fetch failed')

		const products = await res.json()
		const total = Number(res.headers.get('X-WP-Total') ?? 0)
		const totalPages = Number(res.headers.get('X-WP-TotalPages') ?? 1)
		return { products: Array.isArray(products) ? products : [], total, totalPages }
	}

	async getProduct(id: number) {
		const res = await this.woo.get(`products/${id}`)
		if (!res.ok) throw new NotFoundException('Product not found')
		return res.json()
	}

	async updateProduct(id: number, dto: WcProductUpdateDto) {
		const res = await this.woo.put(`products/${id}`, dto)
		if (!res.ok) {
			const text = await res.text().catch(() => res.status.toString())
			throw new BadRequestException(`WC update failed: ${text}`)
		}
		return res.json()
	}

	async getWcTags() {
		const res = await this.woo.get('products/tags', {
			per_page: '100',
			orderby: 'name',
			order: 'asc',
			hide_empty: 'true'
		})
		if (!res.ok) return []
		const data = await res.json()
		return Array.isArray(data)
			? data.map((t: any) => ({ id: t.id, name: t.name, slug: t.slug }))
			: []
	}

	async getWcCategories() {
		const res = await this.woo.get('products/categories', {
			per_page: '100',
			hide_empty: 'false',
			orderby: 'name',
			order: 'asc'
		})
		if (!res.ok) return []
		const data = await res.json()
		return Array.isArray(data)
			? data.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug }))
			: []
	}
}
