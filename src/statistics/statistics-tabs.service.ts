import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from 'src/prisma.service'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import { RetailCrmService } from './retail-crm.service'
import { RETAIL_STATUS_MAP, TAB_CACHE_TTL_MS } from './constants'

dayjs.locale('ru')

@Injectable()
export class StatisticsTabsService {
	private tabCache: Map<string, { data: any; ts: number }> = new Map()

	constructor(
		private prisma: PrismaService,
		private configService: ConfigService,
		private retailCrm: RetailCrmService,
	) {}

	private async cachedTab<T>(key: string, build: () => Promise<T>): Promise<T> {
		const cached = this.tabCache.get(key)
		if (cached) {
			if (Date.now() - cached.ts < TAB_CACHE_TTL_MS) return cached.data
			build().then(data => this.tabCache.set(key, { data, ts: Date.now() })).catch(() => {})
			return cached.data
		}
		const data = await build()
		this.tabCache.set(key, { data, ts: Date.now() })
		return data
	}

	private async wcFetch(path: string, params: Record<string, string> = {}): Promise<any> {
		const wpUrl = this.configService.get('WP_URL')
		const key = this.configService.get('WC_CONSUMER_KEY')
		const secret = this.configService.get('WC_CONSUMER_SECRET')
		if (!wpUrl || !key || !secret) return null
		const auth = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64')
		const qs = new URLSearchParams(params).toString()
		const res = await fetch(`${wpUrl}/wp-json/wc/v3${path}${qs ? '?' + qs : ''}`, { headers: { Authorization: auth } })
		if (!res.ok) return null
		return res.json()
	}

	private async wcFetchWithTotal(path: string, params: Record<string, string> = {}): Promise<{ data: any[]; total: number }> {
		const wpUrl = this.configService.get('WP_URL')
		const key = this.configService.get('WC_CONSUMER_KEY')
		const secret = this.configService.get('WC_CONSUMER_SECRET')
		if (!wpUrl || !key || !secret) return { data: [], total: 0 }
		const auth = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64')
		const qs = new URLSearchParams(params).toString()
		const res = await fetch(`${wpUrl}/wp-json/wc/v3${path}${qs ? '?' + qs : ''}`, { headers: { Authorization: auth } })
		if (!res.ok) return { data: [], total: 0 }
		const total = parseInt(res.headers.get('X-WP-Total') || '0', 10)
		const data = await res.json()
		return { data: Array.isArray(data) ? data : [], total }
	}

	async getOrdersTab() {
		return this.cachedTab('orders-tab', () => this.buildOrdersTab())
	}

	private async buildOrdersTab() {
		const now = dayjs()
		const startOfToday = now.startOf('day').toDate()
		const startOf7Days = now.subtract(7, 'day').toDate()
		const fromStr = now.subtract(30, 'day').format('YYYY-MM-DD HH:mm:ss')
		const toStr = now.format('YYYY-MM-DD HH:mm:ss')

		const [retailOrders, localRows] = await Promise.all([
			this.retailCrm.fetchAllOrders(fromStr, toStr),
			this.prisma.order.findMany({
				select: {
					id: true, wcOrderId: true, status: true, totalPrice: true, createdAt: true,
					user: { select: { displayName: true, name: true, email: true } },
				},
			}),
		])

		const localMap = localRows.reduce((acc, r) => {
			acc.byId.set(r.id, r)
			if (r.wcOrderId) acc.byWc.set(r.wcOrderId, r)
			return acc
		}, { byWc: new Map<number, any>(), byId: new Map<string, any>() })

		const statusCounts: Record<string, number> = {}
		let todayCount = 0, avgTotal = 0
		for (const o of retailOrders) {
			const created = new Date(o.createdAt)
			if (created >= startOfToday) todayCount++
			avgTotal += o.totalSumm || 0
			const mapped = RETAIL_STATUS_MAP[o.status] || o.status
			statusCounts[mapped] = (statusCounts[mapped] || 0) + 1
		}

		const recentRetail = (await this.retailCrm.fetchRecentOrders(20)).slice(0, 8)
		const recentOrders = recentRetail.map(o => {
			const wcId = o.externalId ? parseInt(o.externalId) : null
			const local = (wcId && localMap.byWc.get(wcId)) || localMap.byId.get(o.externalId)
			const customerName = o.customer
				? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim()
				: `${o.firstName || ''} ${o.lastName || ''}`.trim()
			return {
				id: local?.id || (wcId ? String(wcId) : null) || String(o.id),
				localId: local?.id || null,
				wcOrderId: wcId || null,
				status: local?.status || RETAIL_STATUS_MAP[o.status] || o.status,
				totalPrice: o.totalSumm || 0,
				createdAt: new Date(o.createdAt),
				userName: customerName || local?.user?.displayName || local?.user?.name || local?.user?.email || '—',
				source: local ? 'app' : (wcId ? 'site' : 'manual'),
				retailItems: !local && !wcId
					? (o.items || []).map((i: any) => ({ name: i.offer?.name || i.productName || 'Товар', quantity: i.quantity || 1, price: i.initialPrice || 0 }))
					: undefined,
			}
		})

		return {
			statusCounts, todayCount,
			weekCount: retailOrders.filter(o => new Date(o.createdAt) >= startOf7Days).length,
			monthCount: retailOrders.length,
			avgPrice: retailOrders.length > 0 ? Math.round(avgTotal / retailOrders.length) : 0,
			recentOrders,
		}
	}

	async getProductsTab() {
		return this.cachedTab('products-tab', () => this.buildProductsTab())
	}

	private async buildProductsTab() {
		try {
			const [topByOrdersRaw, topByRatingRaw, reviewsRaw, outOfStockRaw, totalRaw] = await Promise.all([
				this.wcFetch('/products', { status: 'publish', orderby: 'popularity', order: 'desc', per_page: '5', _fields: 'id,name,slug,images,average_rating,total_sales,rating_count' }),
				this.wcFetch('/products', { status: 'publish', orderby: 'rating', order: 'desc', per_page: '5', min_rating: '1', _fields: 'id,name,slug,images,average_rating,rating_count' }),
				this.wcFetch('/products/reviews', { status: 'approved', per_page: '5', orderby: 'date', order: 'desc' }),
				this.wcFetchWithTotal('/products', { status: 'publish', stock_status: 'outofstock', per_page: '1' }),
				this.wcFetchWithTotal('/products', { status: 'publish', per_page: '1' }),
			])

			const topByOrders = (topByOrdersRaw || []).map((p: any) => ({
				id: String(p.id), name: p.name || '', slug: p.slug || '',
				ordersCount: p.total_sales || 0, rating: parseFloat(p.average_rating) || 0,
				images: p.images?.map((img: any) => img.src).filter(Boolean) || [],
			}))
			const topByRating = (topByRatingRaw || []).map((p: any) => ({
				id: String(p.id), name: p.name || '', slug: p.slug || '',
				rating: parseFloat(p.average_rating) || 0, countReviews: p.rating_count || 0,
				images: p.images?.map((img: any) => img.src).filter(Boolean) || [],
			}))

			const reviews = reviewsRaw || []
			const productIds = [...new Set(reviews.map((r: any) => r.product_id).filter(Boolean))]
			let productNames: Record<number, string> = {}
			let productSlugs: Record<number, string> = {}
			if (productIds.length > 0) {
				const products = await this.wcFetch('/products', { include: productIds.join(','), _fields: 'id,name,slug', per_page: '20' })
				if (Array.isArray(products)) {
					products.forEach((p: any) => { productNames[p.id] = p.name; productSlugs[p.id] = p.slug })
				}
			}

			const ratedProducts = (topByRatingRaw || []).filter((p: any) => parseFloat(p.average_rating) > 0)
			const avgRating = ratedProducts.length
				? Math.round(ratedProducts.reduce((s: number, p: any) => s + parseFloat(p.average_rating), 0) / ratedProducts.length * 10) / 10
				: 0

			return {
				topByOrders, topByRating,
				recentReviews: reviews.map((r: any) => ({
					id: String(r.id), message: r.review?.replace(/<[^>]*>/g, '') || '',
					rating: r.rating || 0, createdAt: r.date_created, userName: r.reviewer || 'Покупатель',
					productName: productNames[r.product_id] || '', productSlug: productSlugs[r.product_id] || '',
				})),
				outOfStockCount: outOfStockRaw.total, totalPublished: totalRaw.total, avgRating,
			}
		} catch {
			return { topByOrders: [], topByRating: [], recentReviews: [], outOfStockCount: 0, totalPublished: 0, avgRating: 0 }
		}
	}

	async getCustomersTab() {
		return this.cachedTab('customers-tab', () => this.buildCustomersTab())
	}

	private async buildCustomersTab() {
		const startOf30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		const startOf7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

		const [appUsers, newLast30App, activeLast7App, wcTotalRaw, retailOrders, registrationsByMonth] = await Promise.all([
			this.prisma.user.count({ where: { isAdmin: false } }),
			this.prisma.user.count({ where: { createdAt: { gte: startOf30Days }, isAdmin: false } }),
			this.prisma.user.count({ where: { updatedAt: { gte: startOf7Days }, isAdmin: false } }),
			this.wcFetchWithTotal('/customers', { per_page: '1' }),
			this.retailCrm.fetchAllOrders(
				dayjs().subtract(90, 'day').format('YYYY-MM-DD HH:mm:ss'),
				dayjs().format('YYYY-MM-DD HH:mm:ss'),
			),
			this.getUserRegistrationsByMonth(),
		])

		const customerMap = new Map<string, { name: string; totalSpent: number; ordersCount: number }>()
		for (const o of retailOrders) {
			const customerId = o.customer?.id ? String(o.customer.id) : null
			if (!customerId) continue
			const name = `${o.customer?.firstName || ''} ${o.customer?.lastName || ''}`.trim() || '—'
			const existing = customerMap.get(customerId)
			if (existing) { existing.totalSpent += o.totalSumm || 0; existing.ordersCount++ }
			else customerMap.set(customerId, { name, totalSpent: o.totalSumm || 0, ordersCount: 1 })
		}
		const topCustomers = Array.from(customerMap.entries())
			.sort((a, b) => b[1].totalSpent - a[1].totalSpent)
			.slice(0, 5)
			.map(([id, c]) => ({ userId: id, name: c.name, ordersCount: c.ordersCount, totalSpent: c.totalSpent }))

		return { total: appUsers + wcTotalRaw.total, newLast30: newLast30App, activeLast7: activeLast7App, topCustomers, registrationsByMonth }
	}

	async getUserRegistrationsByMonth() {
		const currentMonth = new Date().getMonth()
		const currentYear = new Date().getFullYear()
		const startDate = new Date(currentYear - 1, currentMonth, 1)
		const endDate = new Date(currentYear, currentMonth + 1, 0)
		const allMonths = this.generateMonths(startDate, endDate)

		const registrations = await this.prisma.user.groupBy({
			by: ['createdAt'], _count: true, orderBy: { createdAt: 'asc' },
			where: { createdAt: { gte: startDate, lte: endDate } },
		})

		const regMap = new Map<string, number>()
		for (const reg of registrations) {
			const key = `${reg.createdAt.getFullYear()}-${reg.createdAt.getMonth() + 1}`
			regMap.set(key, (regMap.get(key) || 0) + reg._count)
		}

		return allMonths.map(({ month, year }) => {
			const monthName = dayjs(new Date(year, month - 1)).format('MMMM')
			return { month: monthName.charAt(0).toUpperCase() + monthName.slice(1), year, count: regMap.get(`${year}-${month}`) || 0 }
		})
	}

	private generateMonths(start: Date, end: Date): { month: number; year: number }[] {
		const current = new Date(start)
		const months = []
		while (current < end) {
			months.push({ month: current.getMonth() + 1, year: current.getFullYear() })
			current.setMonth(current.getMonth() + 1)
		}
		return months
	}
}
