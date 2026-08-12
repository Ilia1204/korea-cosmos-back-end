import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from 'src/prisma.service'
import { AuditService } from 'src/audit/audit.service'
import { RetailCrmService } from './retail-crm.service'
import { RETAIL_STATUS_MAP } from './constants'
import {
	LOCAL_TO_RETAILCRM,
	RETAILCRM_TO_LOCAL
} from 'src/retailcrm-sync/retailcrm-status.constants'

@Injectable()
export class AdminOrdersService {
	constructor(
		private prisma: PrismaService,
		private retailCrm: RetailCrmService,
		private auditService: AuditService
	) {}

	async getAdminOrders(search?: string, page = 1) {
		const s = search?.trim()

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
				invoiceId: true,
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
			const appLocal =
				o.externalId && isNaN(Number(o.externalId))
					? localMap.byId.get(o.externalId)
					: undefined
			const wcLocalCandidate = wcId ? localMap.byWc.get(wcId) : undefined
			const dateDiffMs =
				wcLocalCandidate && o.createdAt
					? Math.abs(
							new Date(o.createdAt).getTime() -
								new Date(wcLocalCandidate.createdAt).getTime()
					  )
					: Infinity
			const wcLocal =
				dateDiffMs < 7 * 24 * 60 * 60 * 1000 ? wcLocalCandidate : undefined

			const isAppOrder = !!appLocal || !!wcLocal?.invoiceId
			const localData = appLocal || (isAppOrder ? wcLocal : undefined)

			const source: 'app' | 'site' | 'manual' = isAppOrder
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
				o.customer?.phones?.[0]?.number ||
				o.phone ||
				localData?.user?.phone ||
				null
			const items =
				localData?.items?.map((i: any) => ({
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
				id: localData?.id || (wcId ? String(wcId) : String(o.id)),
				localId: localData?.id || null,
				wcOrderId: wcId,
				retailId: o.id,
				source,
				status: localData?.status || RETAIL_STATUS_MAP[o.status] || o.status,
				totalPrice: localData?.totalPrice || o.totalSumm || 0,
				createdAt: o.createdAt,
				customerName:
					customerName ||
					localData?.user?.displayName ||
					localData?.user?.name ||
					'—',
				phone,
				itemsCount: items.reduce((s: number, i: any) => s + i.quantity, 0),
				items,
				deliveryMethod: localData?.deliveryMethod || o.delivery?.name || null,
				deliveryPrice: localData?.deliveryPrice || o.delivery?.cost || 0
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

	async closeAllRetailOrders() {
		const all = await this.retailCrm.fetchAllRawOrders(100)

		const payedStatuses = new Set<string>(
			Object.entries(RETAILCRM_TO_LOCAL)
				.filter(([, local]) => local === 'payed')
				.map(([retail]) => retail)
		)

		const retailPayed = all.filter(
			(o: any) => !o.externalId && payedStatuses.has(o.status)
		)

		// Параллельно обновляем все заказы
		const results = await Promise.all(
			retailPayed.map(async (o: any) => {
				const ok = await this.retailCrm.updateOrderStatus(o.id, 'complete')
				return ok ? (o.id as number) : null
			})
		)
		const closedIds = results.filter((id): id is number => id !== null)

		return { closed: closedIds.length, total: retailPayed.length, closedIds }
	}

	@Cron('0 16 * * *')
	async handleAutoCloseRetailOrders() {
		const result = await this.closeAllRetailOrders()
		for (const id of result.closedIds) {
			this.auditService
				.log({
					action: 'order.status',
					entity: 'Order',
					entityId: String(id),
					entityName: `RetailCRM #${id}`,
					before: { status: 'payed' },
					after: { status: 'received' },
					revertible: false
				})
				.catch(() => null)
		}
		return result
	}
}
