import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const SDEK_FALLBACK_PRICE = 700
const CDEK_API = 'https://api.cdek.ru/v2'
const SENDER_CITY = 'Ульяновск'
const SENDER_PHONE = '+79000000000'
const SENDER_NAME = 'Korea Cosmos'

const RUSSIAN_POST_API = 'https://otpravka-api.pochta.ru/1.0'

export interface ShipmentItem {
	name: string
	quantity: number
	price: number
}

export interface CdekShipmentParams {
	orderNumber: string
	toPostCode: string
	toCity: string
	toAddress: string
	recipientName: string
	recipientPhone: string
	orderTotal?: number
	items?: ShipmentItem[]
}

export interface RussianPostShipmentParams {
	orderNumber: string
	toPostCode: string
	toCity: string
	toRegion?: string
	toStreet?: string
	toHouse?: string
	toApartment?: string
	recipientName: string
	recipientSurname: string
	recipientPhone: string
	orderTotal?: number
	items?: ShipmentItem[]
}

@Injectable()
export class DeliveryService {
	private readonly logger = new Logger(DeliveryService.name)
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

	async getCdekTrackingNumber(uuid: string): Promise<string | null> {
		const clientId = this.configService.get('CDEK_CLIENT_ID') || ''
		const clientSecret = this.configService.get('CDEK_CLIENT_SECRET') || ''
		if (!clientId || !clientSecret) return null

		try {
			const token = await this.getSdekToken(clientId, clientSecret)
			const response = await fetch(`${CDEK_API}/orders/${uuid}`, {
				headers: { Authorization: `Bearer ${token}` }
			})
			if (!response.ok) return null
			const data = await response.json()
			const cdekNumber = data?.entity?.cdek_number
			return cdekNumber ? String(cdekNumber) : null
		} catch {
			return null
		}
	}

	async createCdekShipment(params: CdekShipmentParams): Promise<{ uuid: string; trackingNumber: string | null } | null> {
		const clientId = this.configService.get('CDEK_CLIENT_ID') || ''
		const clientSecret = this.configService.get('CDEK_CLIENT_SECRET') || ''
		if (!clientId || !clientSecret) return null

		try {
			const token = await this.getSdekToken(clientId, clientSecret)

			const response = await fetch(`${CDEK_API}/orders`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					number: params.orderNumber,
					tariff_code: 137, // Посылка дверь-дверь (ИМ-договор)
					from_location: { postal_code: this.SENDER_POST_CODE, city: SENDER_CITY },
					to_location: {
						postal_code: params.toPostCode,
						city: params.toCity,
						address: params.toAddress
					},
					sender: {
						name: SENDER_NAME,
						phones: [{ number: SENDER_PHONE }]
					},
					recipient: {
						name: params.recipientName,
						phones: [{ number: params.recipientPhone }]
					},
					packages: [
						{
							number: '1',
							weight: this.DEFAULT_WEIGHT,
							length: 20,
							width: 20,
							height: 10,
							items: (params.items?.length ? params.items : [{ name: 'Косметика', quantity: 1, price: params.orderTotal ?? 500 }]).map((item, i) => ({
								name: item.name.slice(0, 255),
								ware_key: String(i + 1),
								marking: String(i + 1),
								payment: { value: 0 },
								cost: item.price,
								weight: Math.round(this.DEFAULT_WEIGHT / (params.items?.length || 1)),
								amount: item.quantity
							}))
						}
					]
				})
			})

			if (!response.ok) {
				this.logger.warn(`CDEK create order failed: ${response.status}`)
				return null
			}

			const data = await response.json()
			const uuid = data?.entity?.uuid
			const isAccepted = data?.requests?.[0]?.state === 'ACCEPTED'

			if (!uuid || !isAccepted) {
				this.logger.warn(`CDEK order not accepted: ${JSON.stringify(data?.requests?.[0])}`)
				return null
			}

			this.logger.log(`CDEK order created, uuid=${uuid}`)

			// cdek_number is typically available within 3-5 seconds of order creation
			await new Promise(resolve => setTimeout(resolve, 4000))
			const trackingNumber = await this.getCdekTrackingNumber(uuid)
			if (trackingNumber) this.logger.log(`CDEK tracking number obtained immediately: ${trackingNumber}`)

			return { uuid, trackingNumber }
		} catch (e) {
			this.logger.error(`CDEK shipment error: ${e}`)
			return null
		}
	}

	async cancelCdekOrder(uuid: string): Promise<boolean> {
		const clientId = this.configService.get('CDEK_CLIENT_ID') || ''
		const clientSecret = this.configService.get('CDEK_CLIENT_SECRET') || ''
		if (!clientId || !clientSecret) return false

		try {
			const token = await this.getSdekToken(clientId, clientSecret)
			const response = await fetch(`${CDEK_API}/orders/${uuid}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` }
			})
			const data = await response.json()
			const state = data?.requests?.[0]?.state
			this.logger.log(`CDEK cancel uuid=${uuid} state=${state}`)
			return state === 'ACCEPTED'
		} catch (e) {
			this.logger.error(`CDEK cancel error: ${e}`)
			return false
		}
	}

	async createRussianPostShipment(
		params: RussianPostShipmentParams
	): Promise<{ id: number; barcode: string | null } | null> {
		const token = this.configService.get('RUSSIAN_POST_TOKEN')
		const userKey = this.configService.get('RUSSIAN_POST_USER_KEY')
		if (!token || !userKey) return null

		try {
			const phone = params.recipientPhone.replace(/\D/g, '')
			const indexTo = parseInt(params.toPostCode, 10) || 0

			const body = [
				{
					'address-type-to': 'DEFAULT',
					'given-name': params.recipientName,
					surname: params.recipientSurname || params.recipientName,
					'index-to': indexTo,
					'region-to': params.toRegion || params.toCity,
					'place-to': params.toCity,
					'street-to': params.toStreet || '',
					'house-to': params.toHouse || '',
					...(params.toApartment ? { 'room-to': params.toApartment } : {}),
					'tel-address': Number(phone) || undefined,
					'mail-type': 'POSTAL_PARCEL',
					'mail-category': 'ORDINARY',
					'mail-direct': 643,
					mass: this.DEFAULT_WEIGHT,
					'order-num': params.orderNumber,
					payment: 0
				}
			]

			const response = await fetch(`${RUSSIAN_POST_API}/user/backlog`, {
				method: 'PUT',
				headers: {
					Authorization: `AccessToken ${token}`,
					'X-User-Authorization': `Basic ${userKey}`,
					'Content-Type': 'application/json;charset=UTF-8',
					Accept: 'application/json;charset=UTF-8'
				},
				body: JSON.stringify(body)
			})

			if (!response.ok) {
				const err = await response.text()
				this.logger.warn(`Russian Post create failed ${response.status}: ${err}`)
				return null
			}

			const data = await response.json()
			const resultIds: number[] = data?.['result-ids']
			const errors = data?.['errors']

			if (!resultIds?.length) {
				this.logger.warn(`Russian Post order error: ${JSON.stringify(data)}`)
				return null
			}

			if (errors?.some((e: any) => e?.['error-codes']?.length)) {
				this.logger.warn(`Russian Post validation errors: ${JSON.stringify(errors)}`)
				return null
			}

			const resultId = resultIds[0]
			this.logger.log(`Russian Post shipment created, id=${resultId}`)

			const barcode = await this.getRussianPostBarcode(resultId, token, userKey)
			if (barcode) this.logger.log(`Russian Post barcode obtained: ${barcode}`)

			return { id: resultId, barcode }
		} catch (e) {
			this.logger.error(`Russian Post shipment error: ${e}`)
			return null
		}
	}

	async cancelRussianPostOrder(id: number): Promise<boolean> {
		const token = this.configService.get('RUSSIAN_POST_TOKEN')
		const userKey = this.configService.get('RUSSIAN_POST_USER_KEY')
		if (!token || !userKey) return false

		try {
			const response = await fetch(`${RUSSIAN_POST_API}/backlog`, {
				method: 'DELETE',
				headers: {
					Authorization: `AccessToken ${token}`,
					'X-User-Authorization': `Basic ${userKey}`,
					'Content-Type': 'application/json;charset=UTF-8',
					Accept: 'application/json;charset=UTF-8'
				},
				body: JSON.stringify([id])
			})
			if (!response.ok) return false
			const data = await response.json()
			const deleted: number[] = data?.['result-ids'] ?? []
			this.logger.log(`Russian Post cancel id=${id} ok=${deleted.includes(id)}`)
			return deleted.includes(id)
		} catch (e) {
			this.logger.error(`Russian Post cancel error: ${e}`)
			return false
		}
	}

	async getRussianPostBarcode(id: number, token?: string, userKey?: string): Promise<string | null> {
		const t = token || this.configService.get('RUSSIAN_POST_TOKEN')
		const uk = userKey || this.configService.get('RUSSIAN_POST_USER_KEY')
		if (!t || !uk) return null

		try {
			const response = await fetch(`${RUSSIAN_POST_API}/backlog/${id}`, {
				headers: {
					Authorization: `AccessToken ${t}`,
					'X-User-Authorization': `Basic ${uk}`,
					Accept: 'application/json;charset=UTF-8'
				}
			})
			if (!response.ok) return null
			const data = await response.json()
			return data?.barcode || null
		} catch {
			return null
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
