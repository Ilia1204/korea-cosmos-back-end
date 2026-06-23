import { Injectable, NotFoundException } from '@nestjs/common'
import { WooCategoryWooClient } from './woo-category-woo.client'

@Injectable()
export class WooCategoryService {
	constructor(private readonly woo: WooCategoryWooClient) {}

	async getAll(search?: string, parent?: number) {
		const all = await this.woo.fetchAllCategories()
		let result = all

		if (search) {
			const q = search.toLowerCase()
			result = result.filter(
				c =>
					c.name.toLowerCase().includes(q) ||
					(c.description || '').toLowerCase().includes(q)
			)
		}

		if (parent !== undefined) {
			result = result.filter(c => c.parent === parent)
		}

		return result.map(c => ({
			...this.format(c),
			childrenCount: all.filter(x => x.parent === c.id).length
		}))
	}

	async getById(id: number) {
		const all = await this.woo.fetchAllCategories()
		const cat = all.find(c => c.id === id)
		if (!cat) throw new NotFoundException('Категория не найдена')

		const parentCat = cat.parent ? all.find(c => c.id === cat.parent) : null
		const children = all
			.filter(c => c.parent === id)
			.map(c => ({
				...this.format(c),
				childrenCount: all.filter(x => x.parent === c.id).length
			}))

		const products = await this.woo.fetchProductsByCategory(id)

		return {
			...this.format(cat),
			parentCategory: parentCat ? this.format(parentCat) : null,
			children,
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

	private format(c: any) {
		return {
			id: c.id as number,
			name: c.name as string,
			slug: c.slug as string,
			parent: c.parent as number,
			description: (c.description || '') as string,
			count: (c.count ?? 0) as number,
			image: (c.image?.src ?? null) as string | null
		}
	}
}
