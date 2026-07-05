import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { WooApiClient } from 'src/woo-sync/woo-api.client'
import { NotificationsService } from 'src/notifications/notifications.service'
import { MoyskladClient } from './moysklad.client'
import { ApplyWooDiscountDto } from './woo-discount.dto'

const WC_SALE_CATEGORY_ID = 128

interface WcProduct {
	id: number
	type: 'simple' | 'variable'
	regular_price: string
	categories: { id: number }[]
	meta_data: { key: string; value: string }[]
}

interface WcVariation {
	id: number
	regular_price: string
	meta_data: { key: string; value: string }[]
}

@Injectable()
export class WooDiscountService {
	private readonly logger = new Logger(WooDiscountService.name)

	constructor(
		private readonly prisma: PrismaService,
		private readonly woo: WooApiClient,
		private readonly ms: MoyskladClient,
		private readonly notifications: NotificationsService
	) {}

	async applyDiscount(dto: ApplyWooDiscountDto) {
		const wcProductIds = await this.resolveWcProductIds(dto)
		if (!wcProductIds.length) return { updated: 0 }

		const products = await this.fetchWcProducts(wcProductIds)
		if (!products.length) return { updated: 0 }

		const saleFrom = dto.startDate ? `${dto.startDate}T00:00:00` : undefined
		const saleTo = dto.endDate ? `${dto.endDate}T23:59:59` : undefined

		const simpleProducts = products.filter(p => p.type !== 'variable')
		const variableProducts = products.filter(p => p.type === 'variable')

		// Простые товары — обновляем напрямую
		const simpleUpdates = simpleProducts.map(p => {
			const regular = parseFloat(p.regular_price) || 0
			const salePrice =
				Math.round(regular * (1 - dto.discount / 100) * 100) / 100
			const hasSaleCategory = p.categories.some(
				c => c.id === WC_SALE_CATEGORY_ID
			)
			return {
				id: p.id,
				sale_price: String(salePrice),
				...(saleFrom ? { date_on_sale_from: saleFrom } : {}),
				...(saleTo ? { date_on_sale_to: saleTo } : {}),
				categories: hasSaleCategory
					? p.categories
					: [...p.categories, { id: WC_SALE_CATEGORY_ID }]
			}
		})
		if (simpleUpdates.length) await this.batchUpdateWc(simpleUpdates)

		// Вариативные товары — обновляем категорию родителя + каждую вариацию
		if (variableProducts.length) {
			const parentUpdates = variableProducts.map(p => ({
				id: p.id,
				categories: p.categories.some(c => c.id === WC_SALE_CATEGORY_ID)
					? p.categories
					: [...p.categories, { id: WC_SALE_CATEGORY_ID }]
			}))
			await this.batchUpdateWc(parentUpdates)

			for (const product of variableProducts) {
				const variations = await this.fetchWcVariations(product.id)
				const variationUpdates = variations
					.filter(v => parseFloat(v.regular_price) > 0)
					.map(v => {
						const regular = parseFloat(v.regular_price)
						const salePrice =
							Math.round(regular * (1 - dto.discount / 100) * 100) / 100
						return {
							id: v.id,
							sale_price: String(salePrice),
							...(saleFrom ? { date_on_sale_from: saleFrom } : {}),
							...(saleTo ? { date_on_sale_to: saleTo } : {})
						}
					})
				if (variationUpdates.length) {
					await this.batchUpdateWcVariations(product.id, variationUpdates)
				}
			}
		}

		// МойСклад — только простые товары (у вариативных маппинг по вариациям)
		const externalCodes = simpleProducts
			.map(p => p.meta_data.find(m => m.key === '_ms_xmlid')?.value)
			.filter(Boolean) as string[]

		if (externalCodes.length) {
			const productPrices = simpleProducts
				.map(p => {
					const regular = parseFloat(p.regular_price) || 0
					return {
						code: p.meta_data.find(m => m.key === '_ms_xmlid')?.value as string,
						salePrice:
							Math.round(regular * (1 - dto.discount / 100) * 100) / 100
					}
				})
				.filter(x => x.code)
			await this.updateMsProductPrices(productPrices)
		}

		if (dto.isSentNotification && dto.title && dto.message) {
			const navData = await this.resolveNotificationNav(dto)
			await this.notifications
				.sendBroadcast(dto.title, dto.message, navData)
				.catch(e => this.logger.warn(`Push notification failed: ${e}`))
		}

		return {
			updated: simpleUpdates.length + variableProducts.length,
			msUpdated: externalCodes.length
		}
	}

	async removeDiscount(dto: Pick<ApplyWooDiscountDto, 'type' | 'ids'>) {
		const wcProductIds = await this.resolveWcProductIds(
			dto as ApplyWooDiscountDto
		)
		if (!wcProductIds.length) return { updated: 0 }

		const products = await this.fetchWcProducts(wcProductIds)
		if (!products.length) return { updated: 0 }

		const simpleProducts = products.filter(p => p.type !== 'variable')
		const variableProducts = products.filter(p => p.type === 'variable')

		// Простые товары
		const simpleUpdates = simpleProducts.map(p => ({
			id: p.id,
			sale_price: '',
			date_on_sale_from: null,
			date_on_sale_to: null,
			categories: p.categories.filter(c => c.id !== WC_SALE_CATEGORY_ID)
		}))
		if (simpleUpdates.length) await this.batchUpdateWc(simpleUpdates)

		// Вариативные товары — убираем категорию у родителя + сбрасываем вариации
		if (variableProducts.length) {
			const parentUpdates = variableProducts.map(p => ({
				id: p.id,
				categories: p.categories.filter(c => c.id !== WC_SALE_CATEGORY_ID)
			}))
			await this.batchUpdateWc(parentUpdates)

			for (const product of variableProducts) {
				const variations = await this.fetchWcVariations(product.id)
				const variationUpdates = variations.map(v => ({
					id: v.id,
					sale_price: '',
					date_on_sale_from: null,
					date_on_sale_to: null
				}))
				if (variationUpdates.length) {
					await this.batchUpdateWcVariations(product.id, variationUpdates)
				}
			}
		}

		const externalCodes = simpleProducts
			.map(p => p.meta_data.find(m => m.key === '_ms_xmlid')?.value)
			.filter(Boolean) as string[]

		if (externalCodes.length) {
			await this.ms.resetSalePrices(externalCodes)
		}

		return { updated: simpleUpdates.length + variableProducts.length }
	}

	private async resolveNotificationNav(
		dto: ApplyWooDiscountDto
	): Promise<object> {
		// Для одного раздела или одной категории — переходим прямо на него
		if (dto.type === 'section' && dto.ids.length === 1) {
			const section = await this.prisma.section.findFirst({
				where: { id: dto.ids[0] },
				select: { slug: true }
			})
			if (section?.slug) return { sectionSlug: section.slug }
		}
		if (dto.type === 'category' && dto.ids.length === 1) {
			const category = await this.prisma.category.findFirst({
				where: { id: dto.ids[0] },
				select: { slug: true }
			})
			if (category?.slug) return { categorySlug: category.slug }
		}
		return { screen: 'Catalog' }
	}

	private async resolveWcProductIds(
		dto: ApplyWooDiscountDto
	): Promise<number[]> {
		switch (dto.type) {
			case 'product':
				return dto.ids.map(Number)

			case 'category': {
				const categories = await this.prisma.category.findMany({
					where: { id: { in: dto.ids } },
					select: { slug: true }
				})
				const wcCategoryIds = await this.getWcCategoryIds(
					categories.map(c => c.slug)
				)
				return this.getWcProductIdsByCategories(wcCategoryIds)
			}

			case 'section': {
				const sections = await this.prisma.section.findMany({
					where: { id: { in: dto.ids } },
					include: { categories: { select: { slug: true } } }
				})
				const slugs = sections.flatMap(s => s.categories.map(c => c.slug))
				const wcCategoryIds = await this.getWcCategoryIds(slugs)
				return this.getWcProductIdsByCategories(wcCategoryIds)
			}

			case 'label': {
				const tagIds = await this.getWcTagIds(dto.ids)
				return this.getWcProductIdsByTags(tagIds)
			}

			default:
				return []
		}
	}

	private async getWcCategoryIds(slugs: string[]): Promise<number[]> {
		const ids: number[] = []
		for (const slug of slugs) {
			try {
				const res = await this.woo.get('products/categories', {
					slug,
					per_page: '1'
				})
				const data = await res.json()
				if (data[0]?.id) ids.push(data[0].id)
			} catch (e) {
				this.logger.warn(`WC: не найдена категория slug=${slug}`)
			}
		}
		return ids
	}

	private async getWcProductIdsByCategories(
		categoryIds: number[]
	): Promise<number[]> {
		if (!categoryIds.length) return []
		const allIds = new Set<number>()
		for (const catId of categoryIds) {
			let page = 1
			while (true) {
				const res = await this.woo.get('products', {
					category: String(catId),
					per_page: '100',
					page: String(page),
					fields: 'id'
				})
				const data = await res.json()
				if (!Array.isArray(data) || !data.length) break
				data.forEach((p: { id: number }) => allIds.add(p.id))
				if (data.length < 100) break
				page++
			}
		}
		return Array.from(allIds)
	}

	private async getWcTagIds(slugs: string[]): Promise<number[]> {
		const ids: number[] = []
		for (const slug of slugs) {
			try {
				const res = await this.woo.get('products/tags', { slug, per_page: '1' })
				const data = await res.json()
				if (data[0]?.id) ids.push(data[0].id)
			} catch (e) {
				this.logger.warn(`WC: не найден тег slug=${slug}`)
			}
		}
		return ids
	}

	private async getWcProductIdsByTags(tagIds: number[]): Promise<number[]> {
		if (!tagIds.length) return []
		const allIds = new Set<number>()
		for (const tagId of tagIds) {
			let page = 1
			while (true) {
				const res = await this.woo.get('products', {
					tag: String(tagId),
					per_page: '100',
					page: String(page),
					fields: 'id'
				})
				const data = await res.json()
				if (!Array.isArray(data) || !data.length) break
				data.forEach((p: { id: number }) => allIds.add(p.id))
				if (data.length < 100) break
				page++
			}
		}
		return Array.from(allIds)
	}

	private async fetchWcProducts(ids: number[]): Promise<WcProduct[]> {
		const products: WcProduct[] = []
		// Запрашиваем по 50 штук
		for (let i = 0; i < ids.length; i += 50) {
			const chunk = ids.slice(i, i + 50)
			const res = await this.woo.get('products', {
				include: chunk.join(','),
				per_page: '50'
			})
			const data = await res.json()
			if (Array.isArray(data)) products.push(...data)
		}
		return products
	}

	private async fetchWcVariations(productId: number): Promise<WcVariation[]> {
		const variations: WcVariation[] = []
		let page = 1
		while (true) {
			const res = await this.woo.get(`products/${productId}/variations`, {
				per_page: '100',
				page: String(page)
			})
			const data = await res.json()
			if (!Array.isArray(data) || !data.length) break
			variations.push(...data)
			if (data.length < 100) break
			page++
		}
		return variations
	}

	private async batchUpdateWcVariations(productId: number, updates: any[]) {
		for (let i = 0; i < updates.length; i += 100) {
			const chunk = updates.slice(i, i + 100)
			const res = await this.woo.post(
				`products/${productId}/variations/batch`,
				{ update: chunk }
			)
			if (!res.ok) {
				const text = await res.text().catch(() => res.status.toString())
				this.logger.error(
					`WC variations batch update failed for product ${productId}: ${text}`
				)
				throw new Error(`WC variations batch failed: ${text}`)
			}
		}
	}

	private async batchUpdateWc(updates: any[]) {
		for (let i = 0; i < updates.length; i += 100) {
			const chunk = updates.slice(i, i + 100)
			const res = await this.woo.post('products/batch', { update: chunk })
			if (!res.ok) {
				const text = await res.text().catch(() => res.status.toString())
				this.logger.error(`WC batch update failed: ${text}`)
				throw new Error(`WC batch failed: ${text}`)
			}
		}
	}

	private async updateMsProductPrices(
		items: { code: string; salePrice: number }[]
	) {
		for (const item of items) {
			try {
				await this.ms.updateSalePrices([item.code], item.salePrice)
			} catch (e) {
				this.logger.warn(`MS update failed for ${item.code}`)
			}
		}
	}
}
