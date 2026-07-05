import { Injectable, Logger } from '@nestjs/common'

const MS_BASE = 'https://api.moysklad.ru/api/remap/1.2'
const MS_SALE_PRICE_TYPE_ID = '772bd51c-fd0b-11ec-0a80-0fd1000943d6'

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

	private async findProductByExternalCode(
		externalCode: string
	): Promise<{ id: string; href: string } | null> {
		try {
			const res = await fetch(
				`${MS_BASE}/entity/product?filter=externalCode=${externalCode}&limit=1`,
				{ headers: this.headers }
			)
			const data = await res.json()
			const product = data?.rows?.[0]
			if (!product) return null
			return { id: product.id, href: product.meta.href }
		} catch (e) {
			this.logger.warn(`MS: не найден товар externalCode=${externalCode}`)
			return null
		}
	}

	async updateSalePrices(
		externalCodes: string[],
		salePriceRubles: number
	): Promise<number> {
		if (!process.env.MOYSKLAD_TOKEN || !externalCodes.length) return 0

		const saleValueKopecks = Math.round(salePriceRubles * 100)
		let updated = 0

		// Ищем и обновляем батчами по 10
		const chunks = []
		for (let i = 0; i < externalCodes.length; i += 10)
			chunks.push(externalCodes.slice(i, i + 10))

		for (const chunk of chunks) {
			const found = await Promise.all(
				chunk.map(code => this.findProductByExternalCode(code))
			)

			await Promise.all(
				found.filter(Boolean).map(async product => {
					try {
						await fetch(`${MS_BASE}/entity/product/${product.id}`, {
							method: 'PUT',
							headers: this.headers,
							body: JSON.stringify({
								salePrices: [
									{
										value: saleValueKopecks,
										priceType: {
											meta: {
												href: `${MS_BASE}/context/companysettings/pricetype/${MS_SALE_PRICE_TYPE_ID}`,
												type: 'pricetype',
												mediaType: 'application/json'
											}
										}
									}
								]
							})
						})
						updated++
					} catch (e) {
						this.logger.warn(`MS: ошибка обновления ${product.id}`)
					}
				})
			)
		}

		return updated
	}

	async resetSalePrices(externalCodes: string[]): Promise<void> {
		if (!process.env.MOYSKLAD_TOKEN || !externalCodes.length) return
		await this.updateSalePrices(externalCodes, 0)
	}
}
