import { Injectable, NotFoundException } from '@nestjs/common'
import { WooTagWooClient } from './woo-tag-woo.client'

@Injectable()
export class WooTagService {
	constructor(private readonly woo: WooTagWooClient) {}

	async getAll(search?: string) {
		const all = await this.woo.fetchAllTags()
		let result = all

		if (search) {
			const q = search.toLowerCase()
			result = result.filter(
				t =>
					t.name.toLowerCase().includes(q) ||
					(t.description || '').toLowerCase().includes(q)
			)
		}

		return result.map(t => this.format(t))
	}

	async getById(id: number) {
		const all = await this.woo.fetchAllTags()
		const tag = all.find(t => t.id === id)
		if (!tag) throw new NotFoundException('Метка не найдена')

		const products = await this.woo.fetchProductsByTag(id)

		return {
			...this.format(tag),
			products: products.map(p => ({
				id: p.id,
				name: p.name,
				slug: p.slug,
				price: p.price || '0',
				image: p.images?.[0]?.src ?? null
			}))
		}
	}

	invalidateCache() {
		this.woo.invalidateCache()
	}

	private format(t: any) {
		return {
			id: t.id as number,
			name: t.name as string,
			slug: t.slug as string,
			description: (t.description || '') as string,
			count: (t.count ?? 0) as number
		}
	}
}
