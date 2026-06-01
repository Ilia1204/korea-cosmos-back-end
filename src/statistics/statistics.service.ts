import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from 'src/prisma.service'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'

dayjs.locale('ru')

type Period = 'week' | 'month' | 'quarter'

const CACHE_TTL_MS = 15 * 60 * 1000

@Injectable()
export class StatisticsService {
	private readonly retailCrmUrl: string
	private readonly retailCrmKey: string
	private cache: Map<Period, { data: any; ts: number }> = new Map()

	constructor(
		private prisma: PrismaService,
		private configService: ConfigService
	) {
		this.retailCrmUrl =
			this.configService.get('RETAILCRM_URL') ||
			'https://koreacosmos.retailcrm.ru'
		this.retailCrmKey = this.configService.get('RETAILCRM_API_KEY')
	}

	async getRetailCRMStats(period: Period = 'month') {
		const cached = this.cache.get(period)
		if (cached) {
			if (Date.now() - cached.ts < CACHE_TTL_MS) return cached.data
			// Кэш устарел — отдаём старые данные сразу, обновляем в фоне
			this.buildRetailCRMStats(period)
				.then(data => this.cache.set(period, { data, ts: Date.now() }))
				.catch(() => {})
			return cached.data
		}
		// Первый запрос — ждём
		const data = await this.buildRetailCRMStats(period)
		this.cache.set(period, { data, ts: Date.now() })
		return data
	}

	private async buildRetailCRMStats(period: Period) {
		const now = dayjs()
		const from =
			period === 'week'
				? now.subtract(7, 'day')
				: period === 'quarter'
				? now.subtract(90, 'day')
				: now.subtract(30, 'day')

		const fromStr = from.format('YYYY-MM-DD HH:mm:ss')
		const toStr = now.format('YYYY-MM-DD HH:mm:ss')

		const orders = await this.fetchAllRetailCRMOrders(fromStr, toStr)

		const revenue = orders.reduce((s, o) => s + (o.totalSumm || 0), 0)
		const paidOrders = orders.filter(o =>
			[
				'prepayed',
				'client-confirmed',
				'complete',
				'assembling-complete',
				'send-to-delivery',
				'delivering'
			].includes(o.status)
		)
		const paidRevenue = paidOrders.reduce((s, o) => s + (o.totalSumm || 0), 0)
		const cancelledOrders = orders.filter(o =>
			['cancel-other', 'no-call', 'no-product'].includes(o.status)
		)
		const avgCheck = orders.length > 0 ? revenue / orders.length : 0

		const statusCounts: Record<string, number> = {}
		for (const o of orders) {
			statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
		}

		const productMap: Record<
			string,
			{ name: string; count: number; revenue: number }
		> = {}
		for (const o of orders) {
			for (const item of o.items || []) {
				const name = item.offer?.name || item.productName || 'Товар'
				if (!productMap[name]) productMap[name] = { name, count: 0, revenue: 0 }
				productMap[name].count += item.quantity || 1
				productMap[name].revenue +=
					(item.initialPrice || 0) * (item.quantity || 1)
			}
		}
		const topProducts = Object.values(productMap)
			.sort((a, b) => b.count - a.count)
			.slice(0, 5)

		const chartData = this.buildChartData(
			orders,
			from.toDate(),
			now.toDate(),
			period
		)

		return {
			revenue: Math.round(revenue),
			paidRevenue: Math.round(paidRevenue),
			ordersCount: orders.length,
			cancelledCount: cancelledOrders.length,
			avgCheck: Math.round(avgCheck),
			cancelRate:
				orders.length > 0
					? Math.round((cancelledOrders.length / orders.length) * 100)
					: 0,
			statusCounts,
			topProducts,
			chartData
		}
	}

	private buildChartData(orders: any[], _from: Date, to: Date, period: Period) {
		const grouped: Record<string, number> = {}

		for (const o of orders) {
			const date = dayjs(o.createdAt)
			const key = date.format('DD.MM')
			grouped[key] = (grouped[key] || 0) + (o.totalSumm || 0)
		}

		const days = period === 'week' ? 7 : period === 'quarter' ? 90 : 30
		const result = []
		for (let i = days - 1; i >= 0; i--) {
			const d = dayjs(to).subtract(i, 'day')
			const key = d.format('DD.MM')
			result.push({ label: key, value: Math.round(grouped[key] || 0) })
		}
		return result
	}

	private async fetchAllRetailCRMOrders(from: string, to: string) {
		if (!this.retailCrmKey) return []
		const allOrders: any[] = []
		let page = 1
		const limit = 100

		try {
			while (true) {
				const params = new URLSearchParams({
					'filter[createdAtFrom]': from,
					'filter[createdAtTo]': to,
					limit: String(limit),
					page: String(page)
				})
				const res = await fetch(`${this.retailCrmUrl}/api/v5/orders?${params}`, {
					headers: { 'X-API-KEY': this.retailCrmKey }
				})
				const data = await res.json()
				if (!data.success || !data.orders?.length) break
				allOrders.push(...data.orders)
				if (allOrders.length >= data.pagination?.totalCount) break
				page++
			}
		} catch {
			return []
		}
		return allOrders
	}

	async getMain() {
		const totalRevenue = await this.calculateTotalRevenue()

		const ordersCount = await this.prisma.order.count()
		const reviewsCount = await this.prisma.review.count()
		const usersCount = await this.prisma.user.count()

		const averageRating = await this.calculateAverageRating()

		return [
			{
				name: 'Заказы',
				value: ordersCount
			},
			{
				name: 'Выручка',
				value: totalRevenue + ' ₽'
			},
			{
				name: 'Отзывы',
				value: reviewsCount
			},
			{
				name: 'Пользователи',
				value: usersCount
			},
			{
				name: 'Средний рейтинг',
				value: averageRating || 0
			}
		]
	}

	private async calculateTotalRevenue() {
		const orders = await this.prisma.order.findMany({
			include: { items: true }
		})

		const totalRevenue = orders.reduce((acc, order) => {
			const total = order.items.reduce((itemAcc, item) => {
				return itemAcc + item.price * item.quantity
			}, 0)
			return acc + total
		}, 0)

		return totalRevenue
	}

	private async calculateAverageRating() {
		const averageRating = await this.prisma.review.aggregate({
			_avg: { rating: true }
		})
		return averageRating._avg.rating
	}

	async getNumbers() {
		const activeUsersCount = await this.prisma.user.count({
			where: {
				updatedAt: {
					gte: new Date(new Date().setDate(new Date().getDate() - 30))
				}
			}
		})

		const newUsersLastMonth = await this.prisma.user.count({
			where: {
				createdAt: {
					gte: new Date(new Date().setDate(new Date().getDate() - 30))
				}
			}
		})

		return [
			{
				name: 'Кол-во активных пользователей за месяц',
				value: activeUsersCount
			},
			{
				name: 'Количество новых пользователей за месяц',
				value: newUsersLastMonth
			}
		]
	}

	async getOrdersTab() {
		const now = new Date()
		const startOfToday = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate()
		)
		const startOf7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
		const startOf30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

		const [
			statusCounts,
			todayCount,
			weekCount,
			monthCount,
			recentOrders,
			avgPrice
		] = await Promise.all([
			this.prisma.order.groupBy({ by: ['status'], _count: true }),
			this.prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
			this.prisma.order.count({ where: { createdAt: { gte: startOf7Days } } }),
			this.prisma.order.count({ where: { createdAt: { gte: startOf30Days } } }),
			this.prisma.order.findMany({
				orderBy: { createdAt: 'desc' },
				take: 6,
				select: {
					id: true,
					status: true,
					totalPrice: true,
					createdAt: true,
					user: { select: { displayName: true, name: true, email: true } }
				}
			}),
			this.prisma.order.aggregate({ _avg: { totalPrice: true } })
		])

		return {
			statusCounts: Object.fromEntries(
				statusCounts.map(s => [s.status, s._count])
			),
			todayCount,
			weekCount,
			monthCount,
			avgPrice: Math.round(avgPrice._avg.totalPrice || 0),
			recentOrders: recentOrders.map(o => ({
				id: o.id,
				status: o.status,
				totalPrice: o.totalPrice,
				createdAt: o.createdAt,
				userName: o.user.displayName || o.user.name || o.user.email
			}))
		}
	}

	async getProductsTab() {
		const [
			topByOrders,
			topByRating,
			recentReviews,
			outOfStockCount,
			totalCount
		] = await Promise.all([
			this.prisma.product.findMany({
				where: { isPublic: true },
				orderBy: { ordersCount: 'desc' },
				take: 5,
				select: {
					id: true,
					name: true,
					slug: true,
					ordersCount: true,
					rating: true,
					images: true
				}
			}),
			this.prisma.product.findMany({
				where: { isPublic: true, countReviews: { gt: 0 } },
				orderBy: { rating: 'desc' },
				take: 5,
				select: {
					id: true,
					name: true,
					slug: true,
					rating: true,
					countReviews: true,
					images: true
				}
			}),
			this.prisma.review.findMany({
				where: { isPublic: true },
				orderBy: { createdAt: 'desc' },
				take: 5,
				select: {
					id: true,
					message: true,
					rating: true,
					createdAt: true,
					user: { select: { displayName: true, name: true } },
					product: { select: { name: true, slug: true } }
				}
			}),
			this.prisma.product.count({ where: { inStock: false } }),
			this.prisma.product.count({ where: { isPublic: true } })
		])

		const avgRating = await this.prisma.review.aggregate({
			_avg: { rating: true }
		})

		return {
			topByOrders,
			topByRating,
			recentReviews: recentReviews.map(r => ({
				id: r.id,
				message: r.message,
				rating: r.rating,
				createdAt: r.createdAt,
				userName: r.user.displayName || r.user.name || 'Пользователь',
				productName: r.product.name,
				productSlug: r.product.slug
			})),
			outOfStockCount,
			totalPublished: totalCount,
			avgRating: Math.round((avgRating._avg.rating || 0) * 10) / 10
		}
	}

	async getCustomersTab() {
		const startOf30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		const startOf7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

		const [total, newLast30, activeLast7, topCustomers, registrationsByMonth] =
			await Promise.all([
				this.prisma.user.count({ where: { isAdmin: false } }),
				this.prisma.user.count({
					where: { createdAt: { gte: startOf30Days }, isAdmin: false }
				}),
				this.prisma.user.count({
					where: { updatedAt: { gte: startOf7Days }, isAdmin: false }
				}),
				this.prisma.order.groupBy({
					by: ['userId'],
					_sum: { totalPrice: true },
					_count: true,
					orderBy: { _sum: { totalPrice: 'desc' } },
					take: 5
				}),
				this.getUserRegistrationsByMonth()
			])

		const topCustomerIds = topCustomers.map(c => c.userId)
		const topUsers = await this.prisma.user.findMany({
			where: { id: { in: topCustomerIds } },
			select: { id: true, displayName: true, name: true, email: true }
		})
		const userMap = Object.fromEntries(topUsers.map(u => [u.id, u]))

		return {
			total,
			newLast30,
			activeLast7,
			topCustomers: topCustomers.map(c => ({
				userId: c.userId,
				name:
					userMap[c.userId]?.displayName ||
					userMap[c.userId]?.name ||
					userMap[c.userId]?.email ||
					'—',
				ordersCount: c._count,
				totalSpent: c._sum.totalPrice || 0
			})),
			registrationsByMonth
		}
	}

	async getUserRegistrationsByMonth() {
		const currentMonth = new Date().getMonth()
		const currentYear = new Date().getFullYear()

		const startDate = new Date(currentYear - 1, currentMonth, 1)
		const endDate = new Date(currentYear, currentMonth + 1, 0)

		const allMonths = this.generateMonths(startDate, endDate)

		const registrations = await this.prisma.user.groupBy({
			by: ['createdAt'],
			_count: true,
			orderBy: {
				createdAt: 'asc'
			},
			where: {
				createdAt: {
					gte: startDate,
					lte: endDate
				}
			}
		})

		const registrationMap = new Map<string, number>()

		for (const reg of registrations) {
			const month = reg.createdAt.getMonth() + 1
			const year = reg.createdAt.getFullYear()
			const key = `${year}-${month}`

			if (registrationMap.has(key)) {
				registrationMap.set(key, registrationMap.get(key) + reg._count)
			} else {
				registrationMap.set(key, reg._count)
			}
		}

		return allMonths.map(({ month, year }) => {
			const key = `${year}-${month}`
			const monthName = dayjs(new Date(year, month - 1)).format('MMMM')
			return {
				month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
				year,
				count: registrationMap.get(key) || 0
			}
		})
	}

	private generateMonths(
		start: Date,
		end: Date
	): { month: number; year: number }[] {
		const current = new Date(start)
		const endMonth = new Date(end)
		const months = []

		while (current < endMonth) {
			months.push({
				month: current.getMonth() + 1,
				year: current.getFullYear()
			})
			current.setMonth(current.getMonth() + 1)
		}

		return months
	}
}
