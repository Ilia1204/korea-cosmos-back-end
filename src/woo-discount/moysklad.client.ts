import { Injectable, Logger } from '@nestjs/common'

const MS_BASE = 'https://api.moysklad.ru/api/remap/1.2'
const MS_BASE_PRICE_TYPE_ID = '65360bbb-4d16-11eb-0a80-03f0002b86f5' // Цена продажи

interface MsSalePrice {
	value: number
	priceType: { meta: { href: string } }
}

@Injectable()
export class MoyskladClient {
	private readonly logger = new Logger(MoyskladClient.name)

	private get headers() {
		return {
			Authorization: `Bearer ${process.env.MOYSKLAD_TOKEN}`,
			'Content-Type': 'application/json',
			'Accept-Encoding': 'gzip'
		}
	}

	private async findProduct(
		externalCode: string
	): Promise<{ id: string; salePrices: MsSalePrice[] } | null> {
		try {
			const res = await fetch(
				`${MS_BASE}/entity/product?filter=externalCode=${externalCode}&limit=1`,
				{ headers: this.headers }
			)
			const data = await res.json()
			const product = data?.rows?.[0]
			if (!product) return null
			return { id: product.id, salePrices: product.salePrices || [] }
		} catch (e) {
			this.logger.warn(`MS: не найден товар externalCode=${externalCode}`)
			return null
		}
	}

	// Заменяет только "Цена продажи", остальные типы цен (в т.ч. "Цена со скидкой") не трогает
	private mergeSalePrices(
		existing: MsSalePrice[],
		valueKopecks: number
	): MsSalePrice[] {
		const priceTypeHref = `${MS_BASE}/context/companysettings/pricetype/${MS_BASE_PRICE_TYPE_ID}`
		const kept = existing.filter(p => p.priceType?.meta?.href !== priceTypeHref)
		return [
			...kept,
			{
				value: valueKopecks,
				priceType: {
					meta: {
						href: priceTypeHref,
						type: 'pricetype',
						mediaType: 'application/json'
					} as any
				}
			}
		]
	}

	async updatePrices(
		items: {
			code: string
			priceRubles: number
			discountProhibited: boolean
		}[]
	): Promise<number> {
		if (!process.env.MOYSKLAD_TOKEN || !items.length) return 0
		let updated = 0

		const chunks: (typeof items)[] = []
		for (let i = 0; i < items.length; i += 10)
			chunks.push(items.slice(i, i + 10))

		for (const chunk of chunks) {
			const found = await Promise.all(
				chunk.map(async item => ({
					item,
					product: await this.findProduct(item.code)
				}))
			)

			await Promise.all(
				found
					.filter(x => x.product)
					.map(async ({ item, product }) => {
						try {
							await fetch(`${MS_BASE}/entity/product/${product!.id}`, {
								method: 'PUT',
								headers: this.headers,
								body: JSON.stringify({
									salePrices: this.mergeSalePrices(
										product!.salePrices,
										Math.round(item.priceRubles * 100)
									),
									discountProhibited: item.discountProhibited
								})
							})
							updated++
						} catch (e) {
							this.logger.warn(`MS: ошибка обновления ${product!.id}`)
						}
					})
			)
		}

		return updated
	}
}
