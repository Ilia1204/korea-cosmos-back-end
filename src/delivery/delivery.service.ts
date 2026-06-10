import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const SDEK_FALLBACK_PRICE = 700

@Injectable()
export class DeliveryService {
	private readonly SENDER_POST_CODE = '432029'
	private readonly DEFAULT_WEIGHT = 500

	private sdekToken: string | null = null
	private sdekTokenExpiry = 0

	constructor(private configService: ConfigService) {}

	async calculateRussianPost(toPostCode: string): Promise<number> {
		const url = `https://tariff.pochta.ru/v2/calculate/tariff?json&from=${this.SENDER_POST_CODE}&to=${toPostCode}&weight=${this.DEFAULT_WEIGHT}&object=23030&pack=10`

		const response = await fetch(url)
		if (!response.ok)
			throw new BadRequestException('Ошибка при запросе к API Почты России')

		const data = await response.json()

		if (data?.paynds) return Math.round(data.paynds / 100)
		if (data?.ground?.paynds) return Math.round(data.ground.paynds / 100)

		if (data?.errors?.length)
			throw new BadRequestException(
				`Почта России: ${data.errors[0]?.msg || 'Ошибка расчёта'}`
			)

		throw new BadRequestException(
			'Не удалось рассчитать стоимость доставки Почты России'
		)
	}

	async calculateSdek(toPostCode: string): Promise<number> {
		const clientId = this.configService.get('CDEK_CLIENT_ID') || ''
		const clientSecret = this.configService.get('CDEK_CLIENT_SECRET') || ''

		if (!clientId || !clientSecret) return SDEK_FALLBACK_PRICE

		try {
			const token = await this.getSdekToken(clientId, clientSecret)

			const response = await fetch('https://api.cdek.ru/v2/calculator/tariff', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					tariff_code: 136,
					from_location: { postal_code: this.SENDER_POST_CODE },
					to_location: { postal_code: toPostCode },
					packages: [
						{ weight: this.DEFAULT_WEIGHT, length: 20, width: 20, height: 10 }
					]
				})
			})

			if (!response.ok) return SDEK_FALLBACK_PRICE

			const data = await response.json()

			const price =
				data?.total_sum ??
				data?.delivery_sum ??
				data?.entity?.delivery_sum ??
				data?.entity?.total_sum

			if (price !== undefined && price !== null) return Math.round(price)

			return SDEK_FALLBACK_PRICE
		} catch {
			return SDEK_FALLBACK_PRICE
		}
	}

	private async getSdekToken(clientId: string, clientSecret: string): Promise<string> {
		const now = Date.now()
		if (this.sdekToken && now < this.sdekTokenExpiry) return this.sdekToken

		const response = await fetch('https://api.cdek.ru/v2/oauth/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'client_credentials',
				client_id: clientId,
				client_secret: clientSecret
			}).toString()
		})

		if (!response.ok)
			throw new BadRequestException('Не удалось получить токен СДЭК')

		const data = await response.json()
		this.sdekToken = data.access_token
		this.sdekTokenExpiry = now + (data.expires_in - 60) * 1000

		return this.sdekToken
	}
}
