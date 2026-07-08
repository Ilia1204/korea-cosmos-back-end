import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/prisma.service'
import { WooSyncService } from 'src/woo-sync/woo-sync.service'
import { RetailCrmService } from './retail-crm.service'

@Injectable()
export class AdminCustomersService {
	constructor(
		private prisma: PrismaService,
		private retailCrm: RetailCrmService,
		private wooSync: WooSyncService
	) {}

	async getCustomers(
		source: string,
		search?: string,
		page = 1,
		role?: string,
		hasOrders?: string
	) {
		if (source === 'site') return this.getWcCustomers(search, page)
		if (source === 'retail') return this.getRetailCustomers(search, page)
		if (source === 'app') return this.getAppCustomers(search, page, role, hasOrders)

		// 'all' — all three combined, deduplicated by email
		const [appRes, wcRes, retailRes] = await Promise.all([
			this.getAppCustomers(search, page, role, hasOrders),
			this.getWcCustomers(search, 1),
			this.getRetailCustomers(search, 1)
		])

		const appEmails = new Set(
			appRes.customers.map(u => u.email?.toLowerCase()).filter(Boolean)
		)

		const wcFiltered = wcRes.customers.filter(
			u => !u.email || !appEmails.has(u.email.toLowerCase())
		)

		const allEmails = new Set([
			...appEmails,
			...wcFiltered.map(u => u.email?.toLowerCase()).filter(Boolean)
		])

		const retailFiltered = retailRes.customers.filter(
			u => !u.email || !allEmails.has(u.email.toLowerCase())
		)

		const combined = [...appRes.customers, ...wcFiltered, ...retailFiltered].sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		)

		return {
			customers: combined,
			page: 1,
			hasMore: appRes.hasMore || wcRes.hasMore || retailRes.hasMore
		}
	}

	async updateWcCustomer(
		wcId: number,
		data: { firstName?: string; lastName?: string; phone?: string }
	) {
		return this.wooSync.updateCustomerById(wcId, data)
	}

	async updateRetailCustomer(
		retailId: number,
		data: { firstName?: string; lastName?: string; phone?: string }
	) {
		return this.retailCrm.updateCustomer(retailId, data)
	}

	async getRetailCustomerLoyalty(retailId: number) {
		const customer = await this.retailCrm.getCustomerById(retailId)
		if (!customer) return null
		const bonus = customer.bonusAccount
		const segments: any[] = customer.segments || []
		const segment = segments.find((s: any) => !s.isDynamic)?.name
			?? segments[0]?.name
			?? null
		return {
			bonusBalance: bonus?.amount ?? 0,
			discount: customer.personalDiscount ?? 0,
			totalSpent: customer.totalSumm ?? 0,
			segment
		}
	}

	async getWcCustomerLoyalty(wcId: number) {
		const customer = await this.wooSync.getCustomerById(wcId)
		if (!customer) return null
		const meta: any[] = customer.meta_data || []
		const discountMeta = meta.find((m: any) => m.key === '_kc_personal_discount')
		const discount = discountMeta ? parseFloat(discountMeta.value) || 0 : 0
		const totalSpent = parseFloat(customer.orders_count > 0 ? (customer as any).total_spent || '0' : '0')
		return {
			bonusBalance: 0,
			discount,
			totalSpent,
			segment: null
		}
	}

	async getRetailOrdersByCustomer(customerId: number) {
		const orders = await this.retailCrm.fetchOrdersByCustomerId(customerId)
		return orders.map((o: any) => ({
			id: String(o.id),
			source: 'retail' as const,
			status: o.status,
			totalPrice: o.totalSumm || 0,
			createdAt: o.createdAt,
			items: (o.items || []).map((i: any) => ({
				productName: i.offer?.name || i.productName || 'Товар',
				quantity: i.quantity || 1,
				price: i.initialPrice || 0
			}))
		}))
	}

	async getWcOrdersByEmail(email: string) {
		const orders = await this.wooSync.getOrdersByEmailAdmin(email)
		return orders.map((o: any) => ({
			id: String(o.id),
			source: 'site' as const,
			status: o.status,
			totalPrice: parseFloat(o.total || '0'),
			createdAt: o.date_created,
			items: (o.line_items || []).map((i: any) => ({
				productName: i.name || 'Товар',
				quantity: i.quantity || 1,
				price: parseFloat(i.price || '0')
			}))
		}))
	}

	private async getAppCustomers(
		search?: string,
		page = 1,
		role?: string,
		hasOrders?: string
	) {
		const limit = 50
		const skip = (page - 1) * limit
		const where: Prisma.UserWhereInput = {}

		if (role === 'admin' || role === 'manager' || role === 'user')
			where.role = role as any

		if (hasOrders === 'yes') where.orders = { some: {} }
		else if (hasOrders === 'no') where.orders = { none: {} }

		if (search?.trim()) {
			const s = search.trim()
			where.OR = [
				{ email: { contains: s, mode: 'insensitive' } },
				{ name: { contains: s, mode: 'insensitive' } },
				{ surname: { contains: s, mode: 'insensitive' } },
				{ displayName: { contains: s, mode: 'insensitive' } },
				{ phone: { contains: s, mode: 'insensitive' } }
			]
		}

		const users = await this.prisma.user.findMany({
			where,
			select: {
				id: true,
				createdAt: true,
				email: true,
				role: true,
				name: true,
				surname: true,
				displayName: true,
				phone: true,
				userLoyalty: {
					select: {
						currentDiscount: true,
						totalAmountSpent: true,
						level: { select: { name: true, discount: true } }
					}
				},
				_count: { select: { orders: true } }
			},
			orderBy: { createdAt: 'desc' },
			skip,
			take: limit
		})

		return {
			customers: users.map(u => ({
				id: u.id,
				source: 'app' as const,
				name: u.name,
				surname: u.surname,
				email: u.email,
				phone: u.phone,
				createdAt: u.createdAt.toISOString(),
				ordersCount: u._count.orders,
				role: u.role,
				loyalty: u.userLoyalty || null
			})),
			page,
			hasMore: users.length === limit
		}
	}

	private async getWcCustomers(search?: string, page = 1) {
		const raw = await this.wooSync.getCustomers(search, page)
		return {
			customers: raw.map((c: any) => ({
				id: String(c.id),
				source: 'site' as const,
				name: c.first_name || null,
				surname: c.last_name || null,
				email: c.email || null,
				phone: c.billing?.phone || null,
				createdAt: c.date_created || new Date().toISOString(),
				ordersCount: c.orders_count || 0
			})),
			page,
			hasMore: raw.length === 50
		}
	}

	private async getRetailCustomers(search?: string, page = 1) {
		const raw = await this.retailCrm.getCustomers(search, page)
		return {
			customers: raw.map((c: any) => ({
				id: String(c.id),
				source: 'retail' as const,
				name: c.firstName || null,
				surname: c.lastName || null,
				email: c.email || null,
				phone: c.phones?.[0]?.number || null,
				createdAt: c.createdAt || new Date().toISOString(),
				ordersCount: c.ordersCount || 0
			})),
			page,
			hasMore: raw.length === 50
		}
	}
}
