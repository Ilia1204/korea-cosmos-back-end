import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { WooProxyService } from './woo-proxy.service'

const PRODUCT_QUERY_KEYS = [
	'category',
	'search',
	'per_page',
	'on_sale',
	'include',
	'tag',
	'slug',
	'attribute',
	'attribute_term',
	'orderby',
	'order',
	'status',
	'catalog_visibility',
	'_fields',
	'page',
	'min_price',
	'max_price',
	'stock_status'
]

@Controller('woo')
export class WooProxyController {
	constructor(private readonly service: WooProxyService) {}

	@Get('products/categories')
	categories(@Query() query: Record<string, string>) {
		const params: Record<string, string> = { per_page: '100' }
		if (query.parent !== undefined) params.parent = query.parent
		if (query.slug) params.slug = query.slug
		if (query.orderby) params.orderby = query.orderby
		if (query.order) params.order = query.order
		if (query._fields) params._fields = query._fields
		return this.service.proxyList(
			'products/categories',
			params,
			this.service.ttl.categories
		)
	}

	@Get('products/categories/:id')
	category(@Param('id') id: string) {
		return this.service.proxyOne(
			`products/categories/${id}`,
			this.service.ttl.categories
		)
	}

	@Get('products/tags')
	tags(@Query() query: Record<string, string>) {
		return this.service.proxyList(
			'products/tags',
			{ per_page: query.per_page ?? '100' },
			this.service.ttl.tags
		)
	}

	@Get('products/paginated')
	productsPaginated(@Query() query: Record<string, string>) {
		const params: Record<string, string> = {
			per_page: '30',
			page: query.page ?? '1',
			orderby: query.orderby ?? 'date',
			order: query.order ?? 'desc',
			status: 'publish',
			catalog_visibility: 'visible'
		}
		if (query.search) params.search = query.search
		if (query.min_price) params.min_price = query.min_price
		if (query.max_price) params.max_price = query.max_price
		if (query.stock_status) params.stock_status = query.stock_status
		if (query.on_sale) params.on_sale = query.on_sale
		if (query.attribute) params.attribute = query.attribute
		if (query.attribute_term) params.attribute_term = query.attribute_term
		return this.service.proxyPaginated(params)
	}

	@Post('products/reviews')
	createReview(@Body() body: any) {
		return this.service.postReview(body)
	}

	@Get('products/:id/variations')
	variations(@Param('id') id: string) {
		return this.service.proxyList(
			`products/${id}/variations`,
			{ per_page: '100' },
			this.service.ttl.variations
		)
	}

	@Get('products/:id/reviews')
	reviews(@Param('id') id: string) {
		return this.service.proxyList(
			'products/reviews',
			{ product: id, per_page: '20', status: 'approved' },
			this.service.ttl.reviews
		)
	}

	@Get('products/:id')
	product(@Param('id') id: string) {
		return this.service.proxyOne(`products/${id}`, this.service.ttl.product)
	}

	@Get('products')
	products(@Query() query: Record<string, string>) {
		const params: Record<string, string> = {}
		for (const key of PRODUCT_QUERY_KEYS) {
			if (query[key] !== undefined) params[key] = query[key]
		}

		if (!params.status) params.status = 'publish'
		return this.service.proxyList('products', params, this.service.ttl.products)
	}

	@Get('coupons')
	coupons() {
		return this.service.proxyList(
			'coupons',
			{ per_page: '100' },
			this.service.ttl.coupons
		)
	}
}
