import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class RetailCrmService {
	private readonly logger = new Logger(RetailCrmService.name)
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
		const fetchPage = async (page: number) => {
			const params = new URLSearchParams({
				'filter[createdAtFrom]': from,
				'filter[createdAtTo]': to,
				limit: '100',
				page: String(page)
			})
			const res = await fetch(`${this.url}/api/v5/orders?${params}`, {
				headers: this.headers
			})
			return res.json()
		}

		try {
			const first = await fetchPage(1)
			if (!first.success || !first.orders?.length) return []

			const totalPages = first.pagination?.totalPageCount ?? 1
			if (totalPages <= 1) return first.orders

			const remainingPages = Array.from(
				{ length: totalPages - 1 },
				(_, i) => i + 2
			)
			const rest: any[] = []
			const CONCURRENCY = 5
			for (let i = 0; i < remainingPages.length; i += CONCURRENCY) {
				const batch = await Promise.all(
					remainingPages.slice(i, i + CONCURRENCY).map(fetchPage)
				)
				rest.push(...batch)
			}

			return [
				...first.orders,
				...rest.flatMap(d => (d.success ? d.orders ?? [] : []))
			]
		} catch {
			return []
		}
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

	async fetchOrdersForAdmin(
		search?: string,
		page = 1,
		extendedStatuses?: string[],
		createdAtFrom?: string,
		createdAtTo?: string
	): Promise<any[]> {
		if (!this.key) return []
		try {
			const s = search?.trim()
			if (!s) {
				const params = new URLSearchParams({ limit: '50', page: String(page) })
				for (const status of extendedStatuses || []) {
					params.append('filter[extendedStatus][]', status)
				}
				if (createdAtFrom) params.set('filter[createdAtFrom]', createdAtFrom)
				if (createdAtTo) params.set('filter[createdAtTo]', createdAtTo)
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
			const res = await fetch(`${this.url}/api/v5/orders/${retailId}?by=id`, {
				headers: this.headers
			})
			const data = await res.json()
			if (!data.success || !data.order) return null
			return data.order
		} catch {
			return null
		}
	}

	async getCustomers(search?: string, page = 1): Promise<any[]> {
		if (!this.key) return []
		try {
			const params = new URLSearchParams({ limit: '50', page: String(page) })
			if (search?.trim()) params.set('filter[name]', search.trim())
			const res = await fetch(`${this.url}/api/v5/customers?${params}`, {
				headers: this.headers
			})
			const data = await res.json()
			return data.customers || []
		} catch {
			return []
		}
	}

	async findCustomerByPhone(phone: string): Promise<any | null> {
		if (!this.key) return null
		try {
			const params = new URLSearchParams({ limit: '1' })
			params.set('filter[phone]', phone)
			const res = await fetch(`${this.url}/api/v5/customers?${params}`, {
				headers: this.headers
			})
			const data = await res.json()
			return data?.customers?.[0] || null
		} catch {
			return null
		}
	}

	async getCustomerById(id: number): Promise<any | null> {
		if (!this.key) return null
		try {
			const res = await fetch(`${this.url}/api/v5/customers/${id}?by=id`, {
				headers: this.headers
			})
			const data = await res.json()
			if (!data.success || !data.customer) return null
			return data.customer
		} catch {
			return null
		}
	}

	async updateCustomer(
		id: number,
		data: {
			firstName?: string
			lastName?: string
			phone?: string
			birthday?: string
		}
	): Promise<boolean> {
		if (!this.key) return false
		try {
			const customer: any = {}
			if (data.firstName !== undefined) customer.firstName = data.firstName
			if (data.lastName !== undefined) customer.lastName = data.lastName
			if (data.phone !== undefined) customer.phones = [{ number: data.phone }]
			if (data.birthday !== undefined) customer.birthday = data.birthday
			const body = new URLSearchParams({
				by: 'id',
				customer: JSON.stringify(customer)
			})
			const res = await fetch(`${this.url}/api/v5/customers/${id}/edit`, {
				method: 'POST',
				headers: {
					...this.headers,
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: body.toString()
			})
			const result = await res.json()
			return result.success === true
		} catch {
			return false
		}
	}

	async fetchAllRawOrders(limit = 100): Promise<any[]> {
		if (!this.key) return []
		try {
			const res = await fetch(
				`${this.url}/api/v5/orders?limit=${limit}&page=1`,
				{ headers: this.headers }
			)
			const data = await res.json()
			return data?.orders || []
		} catch {
			return []
		}
	}

	async updateOrderStatus(
		retailId: number,
		retailStatus: string
	): Promise<boolean> {
		if (!this.key) return false
		try {
			const body = new URLSearchParams({
				by: 'id',
				order: JSON.stringify({ status: retailStatus })
			})
			const res = await fetch(`${this.url}/api/v5/orders/${retailId}/edit`, {
				method: 'POST',
				headers: {
					...this.headers,
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: body.toString()
			})
			const data = await res.json()

			if (data.success && retailStatus === 'complete') {
				this.markPaymentsAsPaid(retailId).catch(() => null)
			}

			return data.success === true
		} catch {
			return false
		}
	}

	private async markPaymentsAsPaid(retailId: number) {
		const res = await fetch(`${this.url}/api/v5/orders/${retailId}?by=id`, {
			headers: this.headers
		})
		const data = await res.json().catch(() => null)
		this.logger.log(
			`[RetailCRM] markPaymentsAsPaid retailId=${retailId} payments=${JSON.stringify(
				data?.order?.payments
			)}`
		)
		if (!data?.success || !data.order) return

		const paymentsRaw = data.order.payments
		const payments: any[] = Array.isArray(paymentsRaw)
			? paymentsRaw
			: Object.values(paymentsRaw ?? {})

		if (!payments.length) {
			this.logger.log(`[RetailCRM] No payments for retailId=${retailId}`)
			return
		}

		for (const payment of payments) {
			if (!payment.id || payment.status === 'paid') continue

			const editRes = await fetch(
				`${this.url}/api/v5/orders/payments/${payment.id}/edit`,
				{
					method: 'POST',
					headers: {
						...this.headers,
						'Content-Type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({
						payment: JSON.stringify({ status: 'paid' })
					}).toString()
				}
			)
			const editData = await editRes.json().catch(() => null)
			this.logger.log(
				`[RetailCRM] Payment ${payment.id} edit result: ${JSON.stringify(
					editData
				)}`
			)
		}
	}
}
