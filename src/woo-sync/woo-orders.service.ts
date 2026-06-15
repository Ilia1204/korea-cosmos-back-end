import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { WooApiClient } from './woo-api.client'
import { WC_TO_LOCAL, LOCAL_TO_WC } from './woo-status.constants'

@Injectable()
export class WooOrdersService {
	private readonly logger = new Logger(WooOrdersService.name)
	private ordersCache = new Map<string, { data: any[]; ts: number }>()
	private readonly ORDERS_CACHE_TTL = 3 * 60 * 1000

	constructor(
		private readonly woo: WooApiClient,
		private readonly prisma: PrismaService
	) {}

	mapStatus(wcStatus: string): string {
		return WC_TO_LOCAL[wcStatus] || 'pending'
	}

	private mapDeliveryMethod(methodId: string | null, methodTitle: string | null): string | null {
		const id = (methodId || '').toLowerCase()
		const title = (methodTitle || '').toLowerCase()
		if (id.includes('cdek') || id.includes('sdek') || title.includes('сдэк') || title.includes('cdek')) return 'sdec'
		if (id.includes('pochta') || id.includes('russian_post') || title.includes('почта')) return 'russian_post'
		if (id.includes('pickup') || title.includes('самовывоз')) return 'pickup'
		return methodTitle || null
	}

	async validateCoupon(code: string) {
		try {
			const res = await this.woo.get(`coupons`, { code })
			const data = await res.json()
			const coupon = data?.[0]
			if (!coupon) return { valid: false, message: 'Промокод не найден' }
			if (coupon.status !== 'publish')
				return { valid: false, message: 'Промокод неактивен' }
			if (coupon.date_expires && new Date(coupon.date_expires) < new Date())
				return { valid: false, message: 'Срок действия промокода истёк' }
			if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit)
				return { valid: false, message: 'Промокод уже использован' }
			return {
				valid: true,
				amount: parseFloat(coupon.amount),
				discountType: coupon.discount_type === 'percent' ? 'percent' : 'fixed',
				description: coupon.description || ''
			}
		} catch {
			return { valid: false, message: 'Ошибка проверки промокода' }
		}
	}

	async getOrders(email: string) {
		const cached = this.ordersCache.get(email)
		if (cached && Date.now() - cached.ts < this.ORDERS_CACHE_TTL)
			return cached.data

		try {
			const customerId = await this.woo.getCustomerId(email)
			if (!customerId) return []

			const res = await this.woo.get('orders', {
				customer: String(customerId),
				per_page: '50',
				orderby: 'date',
				order: 'desc'
			})
			const orders = await res.json()
			if (!Array.isArray(orders)) return []

			const result = orders
				.filter(o => !o.meta_data?.some((m: any) => m.key === '_kc_app_order_id'))
				.map(o => ({
				id: String(o.id),
				number: o.number,
				status: this.mapStatus(o.status),
				totalPrice: Math.round(parseFloat(o.total)),
				deliveryPrice: Math.round(parseFloat(o.shipping_total || '0')),
				deliveryMethod: this.mapDeliveryMethod(o.shipping_lines?.[0]?.method_id, o.shipping_lines?.[0]?.method_title),
				createdAt: o.date_created,
				source: 'woocommerce',
				items: [
					...(o.line_items || []).map((li: any) => ({
						id: String(li.id),
						productId: null,
						quantity: li.quantity,
						price: Math.round(parseFloat(li.price || li.total || '0')),
						productName: li.name,
						productImage: li.image?.src || '',
						product: {
							name: li.name,
							images: li.image?.src ? [li.image.src] : []
						}
					})),
					...(o.fee_lines || []).map((fl: any) => ({
						id: String(fl.id),
						productId: null,
						quantity: 1,
						price: Math.round(parseFloat(fl.total || '0')),
						productName: fl.name,
						productImage: '',
						product: { name: fl.name, images: [] }
					}))
				]
			}))
			this.ordersCache.set(email, { data: result, ts: Date.now() })

			return result
		} catch {
			return []
		}
	}

	async getOrderById(wcId: string) {
		try {
			const res = await this.woo.get(`orders/${wcId}`)
			const o = await res.json()
			if (!o?.id) return null

			return {
				id: String(o.id),
				number: o.number,
				status: this.mapStatus(o.status),
				totalPrice: Math.round(parseFloat(o.total)),
				deliveryPrice: Math.round(parseFloat(o.shipping_total || '0')),
				deliveryMethod: this.mapDeliveryMethod(o.shipping_lines?.[0]?.method_id, o.shipping_lines?.[0]?.method_title),
				discountApplied: 0,
				createdAt: o.date_created,
				source: 'woocommerce',
				trackingNumber: this.extractTrackingNumber(o.meta_data) || '',
				comment: o.customer_note || '',
				user: {
					name: o.billing?.first_name || '',
					surname: o.billing?.last_name || '',
					email: o.billing?.email || '',
					phone: o.billing?.phone || ''
				},
				address: o.billing?.address_1
					? {
							city: o.billing.city || '',
							street: o.billing.address_1 || '',
							postCode: o.billing.postcode || '',
							region: o.billing.city || o.billing.state || ''
					  }
					: null,
				items: [
					...(o.line_items || []).map((li: any) => ({
						id: String(li.id),
						productId: li.product_id ? String(li.product_id) : null,
						quantity: li.quantity,
						price: Math.round(parseFloat(li.price || li.total || '0')),
						product: {
							name: li.name,
							images: li.image?.src ? [li.image.src] : []
						}
					})),
					...(o.fee_lines || []).map((fl: any) => ({
						id: String(fl.id),
						quantity: 1,
						price: Math.round(parseFloat(fl.total || '0')),
						product: { name: fl.name, images: [] }
					}))
				]
			}
		} catch {
			return null
		}
	}

	async createOrderInWooCommerce(
		userEmail: string,
		order: any,
		address: any | null,
		items: Array<{
			productId?: string | null
			quantity: number
			price: number
			productName?: string
		}>,
		userInfo?: { name?: string; surname?: string; phone?: string }
	): Promise<number | null> {
		try {
			const customerId = await this.woo.getCustomerId(userEmail)
			this.logger.log(
				`[WC createOrder] customerId=${customerId} email=${userEmail}`
			)

			const productIds = items.map(i => i.productId).filter(Boolean) as string[]
			let wcProductIdMap: Record<string, number> = {}

			if (productIds.length > 0) {
				const localProducts = await this.prisma.product.findMany({
					where: { id: { in: productIds } },
					select: { id: true, slug: true }
				})
				const slugs = localProducts.map(p => p.slug)
				if (slugs.length > 0) {
					const res = await this.woo.get('products', {
						slug: slugs.join(','),
						per_page: '100'
					})
					const wcProducts = await res.json()
					if (Array.isArray(wcProducts)) {
						for (const wcp of wcProducts) {
							const local = localProducts.find(p => p.slug === wcp.slug)
							if (local) wcProductIdMap[local.id] = wcp.id
						}
					}
				}
			}

			const lineItems = items
				.map(item => {
					const wcProductId = item.productId
						? wcProductIdMap[item.productId]
						: undefined
					return wcProductId
						? { product_id: wcProductId, quantity: item.quantity }
						: null
				})
				.filter(Boolean)

			const unknownItems = items.filter(item => {
				const wcProductId = item.productId
					? wcProductIdMap[item.productId]
					: undefined
				return !wcProductId
			})

			const isOtherRecipient = order.recipientDetails === 'other_recipient'
			const body: any = {
				status: 'pending',
				customer_id: customerId || 0,
				billing: {
					email: userEmail,
					first_name: isOtherRecipient
						? order.recipientName || ''
						: userInfo?.name || order.recipientName || '',
					last_name: isOtherRecipient
						? order.recipientSurname || ''
						: userInfo?.surname || order.recipientSurname || '',
					phone: isOtherRecipient
						? order.recipientPhone || ''
						: userInfo?.phone || order.recipientPhone || ''
				},
				meta_data: [
					{ key: '_kc_app_order_id', value: order.id },
					{
						key: '_wc_order_attribution_origin',
						value: 'Мобильное приложение'
					},
					{ key: '_wc_order_attribution_source_type', value: 'mobile_app' },
					{ key: '_wc_order_attribution_utm_source', value: 'korea-cosmos-app' }
				]
			}

			if (lineItems.length > 0) body.line_items = lineItems
			if (unknownItems.length > 0) {
				const feeTotal = unknownItems.reduce(
					(sum, i) => sum + i.price * i.quantity,
					0
				)
				const feeNames = unknownItems
					.map(i => `${i.productName || 'Товар'} ×${i.quantity}`)
					.join(', ')
				body.fee_lines = [
					{ name: feeNames, total: String(feeTotal), tax_class: '' }
				]
			}
			if (address) {
				body.shipping = {
					first_name: order.recipientName || '',
					last_name: order.recipientSurname || '',
					address_1: [address.street, address.house].filter(Boolean).join(', '),
					address_2: address.apartment || '',
					city: address.city || '',
					state: address.region || '',
					postcode: address.postCode || '',
					country: 'RU'
				}
			}

			const res = await this.woo.post('orders', body)
			const created = await res.json()
			this.logger.log(`[WC createOrder] status=${res.status} id=${created?.id}`)
			if (!created?.id) return null

			this.woo
				.post(`orders/${created.id}/notes`, {
					note: '📱 Заказ из мобильного приложения',
					customer_note: false
				})
				.catch(() => null)

			return created.id
		} catch (e) {
			this.logger.error('WC createOrder error:', e)
			return null
		}
	}

	async updateOrderStatus(orderId: string, localStatus: string) {
		const wcStatus = LOCAL_TO_WC[localStatus]
		if (!wcStatus) return

		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: { wcOrderId: true }
		})
		if (!order?.wcOrderId) return
		await this.updateWooOrderById(order.wcOrderId, localStatus)
	}

	async updateWooOrderById(wcId: number, localStatus: string) {
		const wcStatus = LOCAL_TO_WC[localStatus]
		if (!wcStatus) return
		try {
			await this.woo.put(`orders/${wcId}`, { status: wcStatus })
		} catch (e) {
			this.logger.error('WooCommerce status update error:', e)
		}
	}

	async updateCustomerDiscount(email: string, discount: number): Promise<void> {
		try {
			const customerId = await this.woo.getCustomerId(email)
			if (!customerId) return
			await this.woo.put(`customers/${customerId}`, {
				meta_data: [{ key: '_kc_personal_discount', value: String(discount) }]
			})
		} catch (e) {
			this.logger.error('WC updateCustomerDiscount error:', e)
		}
	}

	async getCustomerById(wcId: number): Promise<any | null> {
		try {
			const res = await this.woo.get(`customers/${wcId}`, {})
			if (!res.ok) return null
			return await res.json()
		} catch {
			return null
		}
	}

	async updateCustomerById(
		wcId: number,
		data: { firstName?: string; lastName?: string; phone?: string }
	): Promise<boolean> {
		try {
			const body: any = {}
			if (data.firstName !== undefined) body.first_name = data.firstName
			if (data.lastName !== undefined) body.last_name = data.lastName
			if (data.phone !== undefined) body.billing = { phone: data.phone }
			const res = await this.woo.put(`customers/${wcId}`, body)
			return res.ok
		} catch (e) {
			this.logger.error('WC updateCustomerById error:', e)
			return false
		}
	}

	async getCustomers(search?: string, page = 1): Promise<any[]> {
		try {
			const params: any = { per_page: '50', page: String(page) }
			if (search?.trim()) params.search = search.trim()
			const res = await this.woo.get('customers', params)
			if (!res.ok) return []
			const data = await res.json()
			return Array.isArray(data) ? data : []
		} catch {
			return []
		}
	}

	async getOrdersByEmailAdmin(email: string): Promise<any[]> {
		try {
			const customerId = await this.woo.getCustomerId(email)
			if (!customerId) return []
			const res = await this.woo.get('orders', {
				customer: String(customerId),
				per_page: '20',
				orderby: 'date',
				order: 'desc'
			})
			if (!res.ok) return []
			const data = await res.json()
			return Array.isArray(data) ? data : []
		} catch {
			return []
		}
	}

	async getOrdersByIds(wcIds: number[]) {
		const res = await this.woo.get('orders', {
			include: wcIds.join(','),
			per_page: '100'
		})
		if (!res.ok) return []
		const data = await res.json()
		return Array.isArray(data) ? data : []
	}

	private extractTrackingNumber(metaData: any[]): string | null {
		if (!Array.isArray(metaData)) return null
		const tracking = metaData.find(m => m.key === '_wc_shipment_tracking_items')
		if (tracking?.value?.[0]?.tracking_number)
			return tracking.value[0].tracking_number
		const simple = metaData.find(m => m.key === '_tracking_number')
		return simple?.value ? String(simple.value) : null
	}
}
