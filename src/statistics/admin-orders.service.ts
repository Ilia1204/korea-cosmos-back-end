import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { RetailCrmService } from './retail-crm.service'
import { RETAIL_STATUS_MAP } from './constants'

const LOCAL_TO_RETAILCRM: Record<string, string> = {
	pending: 'new',
	payed: 'prepayed',
	shipped: 'send-to-delivery',
	delivered: 'complete',
	cancelled: 'cancel-other',
	ready_to_receive: 'assembling-complete'
}

@Injectable()
export class AdminOrdersService {
	constructor(
		private prisma: PrismaService,
		private retailCrm: RetailCrmService
	) {}

	async getAdminOrders(search?: string, page = 1) {
		const s = search?.trim()

		// CUID префикс → ищем в локальной БД, потом по externalId в RetailCRM
		let retailOrders: any[]
		if (s && /^[a-zA-Z][a-zA-Z0-9]+$/.test(s)) {
			const localOrders = await this.prisma.order.findMany({
				where: { id: { startsWith: s.toLowerCase() } },
				select: { id: true },
				take: 5
			})
			retailOrders = localOrders.length
				? await this.retailCrm.fetchOrdersByExternalIds(
						localOrders.map(o => o.id)
				  )
				: []
		} else {
			retailOrders = await this.retailCrm.fetchOrdersForAdmin(search, page)
		}

		const localRows = await this.prisma.order.findMany({
			select: {
				id: true,
				wcOrderId: true,
				status: true,
				totalPrice: true,
				createdAt: true,
				deliveryMethod: true,
				deliveryPrice: true,
				items: {
					select: {
						productName: true,
						productImage: true,
						quantity: true,
						price: true
					}
				}
			}
		})

		const usersRaw = await this.prisma.user.findMany({
			where: { orders: { some: { id: { in: localRows.map(r => r.id) } } } },
			select: {
				id: true,
				name: true,
				surname: true,
				displayName: true,
				email: true,
				phone: true,
				orders: { select: { id: true } }
			}
		})
		const userByOrderId = new Map<string, (typeof usersRaw)[0]>()
		for (const u of usersRaw) {
			for (const o of u.orders) userByOrderId.set(o.id, u)
		}

		const localMap = localRows.reduce(
			(acc, r) => {
				const row = { ...r, user: userByOrderId.get(r.id) || null }
				acc.byId.set(r.id, row)
				if (r.wcOrderId) acc.byWc.set(r.wcOrderId, row)
				return acc
			},
			{ byId: new Map<string, any>(), byWc: new Map<number, any>() }
		)

		const orders = retailOrders.map((o: any) => {
			const wcId = o.externalId ? parseInt(o.externalId) : null
			// appLocal: externalId matches a CUID in local DB (app orders have CUID ids, not numeric)
			const appLocal = o.externalId && isNaN(Number(o.externalId))
				? localMap.byId.get(o.externalId)
				: undefined
			// wcLocal: numeric externalId matches a WooCommerce order AND dates are close
			// (retail orders can have same numeric externalId as unrelated WC orders)
			const wcLocalCandidate = wcId ? localMap.byWc.get(wcId) : undefined
			const dateDiffMs = wcLocalCandidate && o.createdAt
				? Math.abs(new Date(o.createdAt).getTime() - new Date(wcLocalCandidate.createdAt).getTime())
				: Infinity
			const wcLocal = dateDiffMs < 7 * 24 * 60 * 60 * 1000 ? wcLocalCandidate : undefined

			const source: 'app' | 'site' | 'manual' = appLocal
				? 'app'
				: wcLocal
				? 'site'
				: wcId && !wcLocalCandidate
				? 'site'
				: 'manual'
			const customerName = o.customer
				? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim()
				: `${o.firstName || ''} ${o.lastName || ''}`.trim()
			const phone =
				o.customer?.phones?.[0]?.number || o.phone || appLocal?.user?.phone || null
			const items =
				appLocal?.items?.map((i: any) => ({
					name: i.productName || 'Товар',
					quantity: i.quantity,
					price: i.price,
					slug: null,
					image: i.productImage || null
				})) ||
				(o.items || []).map((i: any) => ({
					name: i.offer?.name || i.productName || 'Товар',
					quantity: i.quantity || 1,
					price: i.initialPrice || 0,
					slug: null,
					image: null
				}))

			return {
				id: appLocal?.id || (wcId ? String(wcId) : String(o.id)),
				localId: appLocal?.id || null,
				wcOrderId: wcId,
				retailId: o.id,
				source,
				status: appLocal?.status || wcLocal?.status || RETAIL_STATUS_MAP[o.status] || o.status,
				totalPrice: appLocal?.totalPrice || o.totalSumm || 0,
				createdAt: o.createdAt,
				customerName:
					customerName || appLocal?.user?.displayName || appLocal?.user?.name || '—',
				phone,
				itemsCount: items.reduce((s: number, i: any) => s + i.quantity, 0),
				items,
				deliveryMethod: appLocal?.deliveryMethod || null,
				deliveryPrice: appLocal?.deliveryPrice || 0
			}
		})

		return { orders, page, hasMore: retailOrders.length === 50 }
	}

	async getRetailOrder(retailId: number) {
		const o = await this.retailCrm.getOrder(retailId)
		if (!o) return null


		const phone = o.customer?.phones?.[0]?.number || o.phone || null
		const delivery = o.delivery || {}
		const address = delivery.address || {}
		const customerName = o.customer
			? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim()
			: `${o.firstName || ''} ${o.lastName || ''}`.trim()

		return {
			id: String(retailId),
			retailId,
			source: 'manual' as const,
			status: RETAIL_STATUS_MAP[o.status] || o.status,
			totalPrice: o.totalSumm || 0,
			createdAt: o.createdAt,
			customerName,
			phone,
			comment: o.customerComment || o.managerComment || null,
			cancelReason: o.statusComment || null,
			deliveryMethod: delivery.code || null,
			deliveryPrice: delivery.cost || 0,
			address: address.text
				? {
						text: address.text,
						city: address.city,
						street: address.street,
						house: address.house
				  }
				: null,
			items: (o.items || []).map((i: any) => ({
				id: String(i.id || Math.random()),
				productName: i.offer?.name || i.productName || 'Товар',
				quantity: i.quantity || 1,
				price: i.initialPrice || 0
			})),
			user: {
				name: o.customer?.firstName || '',
				surname: o.customer?.lastName || '',
				email: o.customer?.email || '',
				phone,
				id: null
			}
		}
	}

	async updateRetailOrderStatus(retailId: number, localStatus: string) {
		const retailStatus = LOCAL_TO_RETAILCRM[localStatus]
		if (!retailStatus) throw new Error(`Unknown status: ${localStatus}`)
		const ok = await this.retailCrm.updateOrderStatus(retailId, retailStatus)
		if (!ok) throw new Error('RetailCRM update failed')
		return { success: true }
	}
}
