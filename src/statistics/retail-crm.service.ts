import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class RetailCrmService {
	readonly url: string
	readonly key: string

	constructor(private configService: ConfigService) {
		this.url =
			this.configService.get('RETAILCRM_URL') ||
			'https://koreacosmos.retailcrm.ru'
		this.key = this.configService.get('RETAILCRM_API_KEY')
	}

	private get headers() {
		return { 'X-API-KEY': this.key }
	}

	async fetchAllOrders(from: string, to: string): Promise<any[]> {
		if (!this.key) return []
		const all: any[] = []
		let page = 1
		try {
			while (true) {
				const params = new URLSearchParams({
					'filter[createdAtFrom]': from,
					'filter[createdAtTo]': to,
					limit: '100',
					page: String(page)
				})
				const res = await fetch(`${this.url}/api/v5/orders?${params}`, {
					headers: this.headers
				})
				const data = await res.json()
				if (!data.success || !data.orders?.length) break
				all.push(...data.orders)
				if (all.length >= data.pagination?.totalCount) break
				page++
			}
		} catch {
			return []
		}
		return all
	}

	async fetchRecentOrders(limit = 20): Promise<any[]> {
		if (!this.key) return []
		try {
			const params = new URLSearchParams({ limit: String(limit), page: '1' })
			const res = await fetch(`${this.url}/api/v5/orders?${params}`, {
				headers: this.headers
			})
			const data = await res.json()
			return data?.orders || []
		} catch {
			return []
		}
	}

	async fetchOrdersForAdmin(search?: string, page = 1): Promise<any[]> {
		if (!this.key) return []
		try {
			const s = search?.trim()
			if (!s) {
				const params = new URLSearchParams({ limit: '50', page: String(page) })
				const res = await fetch(`${this.url}/api/v5/orders?${params}`, {
					headers: this.headers
				})
				const data = await res.json()
				return data?.orders || []
			}

			// 1-5 цифр → RetailCRM ID + WC externalId параллельно
			if (/^\d{1,5}$/.test(s)) {
				const [byId, byExtId] = await Promise.all([
					fetch(
						`${this.url}/api/v5/orders?limit=50&filter%5Bids%5D%5B%5D=${s}`,
						{ headers: this.headers }
					)
						.then(r => r.json())
						.then(d => d?.orders || []),
					fetch(
						`${this.url}/api/v5/orders?limit=50&filter%5BexternalIds%5D%5B%5D=${s}`,
						{ headers: this.headers }
					)
						.then(r => r.json())
						.then(d => d?.orders || [])
				])
				const seen = new Set<number>()
				return [...byId, ...byExtId].filter(o => {
					if (seen.has(o.id)) return false
					seen.add(o.id)
					return true
				})
			}

			// Телефон (6+ цифр) или имя → ищем клиентов, потом их заказы
			const isPhone = /^\+?\d{6,}$/.test(s) || /^[\d\s\-()+]{6,}$/.test(s)
			const filterKey = isPhone ? 'filter[phone]' : 'filter[name]'
			const custParams = new URLSearchParams({ limit: '20' })
			custParams.set(filterKey, s)
			const custRes = await fetch(
				`${this.url}/api/v5/customers?${custParams}`,
				{ headers: this.headers }
			)
			const custData = await custRes.json()
			const customers: any[] = custData?.customers || []
			if (!customers.length) return []
			const results = await Promise.all(
				customers.map(c => this.fetchOrdersByCustomerId(c.id, page))
			)
			return results.flat()
		} catch {
			return []
		}
	}

	async fetchOrdersByCustomerId(customerId: number, page = 1): Promise<any[]> {
		const p = new URLSearchParams({ limit: '50', page: String(page) })
		p.set('filter[customerId]', String(customerId))
		const r = await fetch(`${this.url}/api/v5/orders?${p}`, {
			headers: this.headers
		})
		const d = await r.json()
		return d?.orders || []
	}

	async fetchOrdersByExternalIds(externalIds: string[]): Promise<any[]> {
		if (!this.key || !externalIds.length) return []
		const results = await Promise.all(
			externalIds.map(id =>
				fetch(
					`${
						this.url
					}/api/v5/orders?limit=10&filter%5BexternalIds%5D%5B%5D=${encodeURIComponent(
						id
					)}`,
					{ headers: this.headers }
				)
					.then(r => r.json())
					.then(d => d?.orders || [])
			)
		)
		return results.flat()
	}

	async getOrder(retailId: number): Promise<any | null> {
		if (!this.key) return null
		try {
			const res = await fetch(`${this.url}/api/v5/orders/${retailId}`, {
				headers: this.headers
			})
			const data = await res.json()
			if (!data.success || !data.order) return null
			return data.order
		} catch {
			return null
		}
	}

	async updateOrderStatus(retailId: number, retailStatus: string): Promise<boolean> {
		if (!this.key) return false
		try {
			const body = new URLSearchParams({
				by: 'id',
				'order[status]': retailStatus
			})
			const res = await fetch(`${this.url}/api/v5/orders/${retailId}/edit`, {
				method: 'POST',
				headers: { ...this.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body.toString()
			})
			const data = await res.json()
			return data.success === true
		} catch {
			return false
		}
	}
}
