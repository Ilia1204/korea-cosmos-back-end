import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from 'src/prisma.service'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import { RetailCrmService } from './retail-crm.service'
import { STATS_CACHE_TTL_MS } from './constants'

dayjs.locale('ru')

type Period = 'week' | 'month' | 'quarter'

@Injectable()
export class StatisticsService {
	private cache: Map<Period, { data: any; ts: number }> = new Map()

	constructor(
		private prisma: PrismaService,
		private configService: ConfigService,
		private retailCrm: RetailCrmService
	) {}

	async getMain() {
		const [ordersCount, reviewsCount, usersCount, totalRevenue, averageRating] =
			await Promise.all([
				this.prisma.order.count(),
				this.prisma.review.count(),
				this.prisma.user.count(),
				this.calculateTotalRevenue(),
				this.calculateAverageRating()
			])
		return [
			{ name: 'Заказы', value: ordersCount },
			{ name: 'Выручка', value: totalRevenue + ' ₽' },
			{ name: 'Отзывы', value: reviewsCount },
			{ name: 'Пользователи', value: usersCount },
			{ name: 'Средний рейтинг', value: averageRating || 0 }
		]
	}

	private async calculateTotalRevenue() {
		const orders = await this.prisma.order.findMany({
			include: { items: true }
		})
		return orders.reduce(
			(acc, order) =>
				acc + order.items.reduce((s, i) => s + i.price * i.quantity, 0),
			0
		)
	}

	private async calculateAverageRating() {
		const result = await this.prisma.review.aggregate({
			_avg: { rating: true }
		})
		return result._avg.rating
	}

	async getNumbers() {
		const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		const [activeUsersCount, newUsersLastMonth] = await Promise.all([
			this.prisma.user.count({ where: { updatedAt: { gte: since30 } } }),
			this.prisma.user.count({ where: { createdAt: { gte: since30 } } })
		])
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

	async getRetailCRMStats(period: Period = 'month') {
		const cached = this.cache.get(period)
		if (cached) {
			if (Date.now() - cached.ts < STATS_CACHE_TTL_MS) return cached.data
			this.buildRetailCRMStats(period)
				.then(data => this.cache.set(period, { data, ts: Date.now() }))
				.catch(() => {})
			return cached.data
		}
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
		const orders = await this.retailCrm.fetchAllOrders(
			from.format('YYYY-MM-DD HH:mm:ss'),
			now.format('YYYY-MM-DD HH:mm:ss')
		)

		const revenue = orders.reduce((s, o) => s + (o.totalSumm || 0), 0)
		const paidStatuses = [
			'prepayed',
			'client-confirmed',
			'complete',
			'assembling-complete',
			'send-to-delivery',
			'delivering'
		]
		const cancelStatuses = ['cancel-other', 'no-call', 'no-product']
		const paidRevenue = orders
			.filter(o => paidStatuses.includes(o.status))
			.reduce((s, o) => s + (o.totalSumm || 0), 0)
		const cancelledCount = orders.filter(o =>
			cancelStatuses.includes(o.status)
		).length

		const statusCounts: Record<string, number> = {}
		const productMap: Record<
			string,
			{ name: string; wcId: string | null; count: number; revenue: number }
		> = {}
		for (const o of orders) {
			statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
			for (const item of o.items || []) {
				const name = item.offer?.name || item.productName || 'Товар'
				const wcId = item.offer?.externalId || null
				if (!productMap[name])
					productMap[name] = { name, wcId, count: 0, revenue: 0 }
				productMap[name].count += item.quantity || 1
				productMap[name].revenue +=
					(item.initialPrice || 0) * (item.quantity || 1)
			}
		}

		const topCandidates = Object.values(productMap)
			.sort((a, b) => b.count - a.count)
			.slice(0, 15)
		const resolved = await Promise.all(
			topCandidates.map(async p => {
				const slug = await this.getWCProductSlug(p.wcId, p.name)
				return slug
					? { name: p.name, count: p.count, revenue: p.revenue, slug }
					: null
			})
		)

		return {
			revenue: Math.round(revenue),
			paidRevenue: Math.round(paidRevenue),
			ordersCount: orders.length,
			cancelledCount,
			avgCheck: orders.length > 0 ? Math.round(revenue / orders.length) : 0,
			cancelRate:
				orders.length > 0
					? Math.round((cancelledCount / orders.length) * 100)
					: 0,
			statusCounts,
			topProducts: resolved.filter(Boolean).slice(0, 5),
			chartData: this.buildChartData(
				orders,
				from.toDate(),
				now.toDate(),
				period
			)
		}
	}

	private buildChartData(orders: any[], _from: Date, to: Date, period: Period) {
		const grouped: Record<string, number> = {}
		for (const o of orders)
			grouped[dayjs(o.createdAt).format('DD.MM')] =
				(grouped[dayjs(o.createdAt).format('DD.MM')] || 0) + (o.totalSumm || 0)
		const days = period === 'week' ? 7 : period === 'quarter' ? 90 : 30
		return Array.from({ length: days }, (_, i) => {
			const key = dayjs(to)
				.subtract(days - 1 - i, 'day')
				.format('DD.MM')
			return { label: key, value: Math.round(grouped[key] || 0) }
		})
	}

	private async getWCProductSlug(
		wcId: string | null,
		name: string
	): Promise<string | null> {
		try {
			const wpUrl = this.configService.get('WP_URL')
			const key = this.configService.get('WC_CONSUMER_KEY')
			const secret = this.configService.get('WC_CONSUMER_SECRET')
			if (!wpUrl || !key || !secret) return null
			const auth = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64')

			if (wcId) {
				const res = await fetch(
					`${wpUrl}/wp-json/wc/v3/products/${wcId}?_fields=slug`,
					{ headers: { Authorization: auth } }
				)
				if (res.ok) {
					const data = await res.json()
					if (data?.slug) return data.slug
				}
			}

			const words = name.split(' ')
			for (const query of [
				words.slice(0, 3).join(' '),
				words.slice(1, 4).join(' ')
			]) {
				if (!query.trim()) continue
				const res = await fetch(
					`${wpUrl}/wp-json/wc/v3/products?${new URLSearchParams({
						search: query,
						per_page: '1',
						_fields: 'slug'
					})}`,
					{ headers: { Authorization: auth } }
				)
				const data = await res.json()
				if (data[0]?.slug) return data[0].slug
			}
			return null
		} catch {
			return null
		}
	}
}
