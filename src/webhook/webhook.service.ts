import { Injectable } from '@nestjs/common'
import { LoyaltyLevelService } from 'src/loyalty-level/loyalty-level.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { getOrderStatusIcons, getOrderStatusTranslation } from 'src/utils/translate-status'
import { WooSyncService } from 'src/woo-sync/woo-sync.service'

const WC_TO_LOCAL: Record<string, string> = {
	pending: 'pending',
	processing: 'payed',
	'on-hold': 'pending',
	completed: 'delivered',
	cancelled: 'cancelled',
	refunded: 'cancelled',
	failed: 'cancelled'
}

const RETAILCRM_TO_LOCAL: Record<string, string> = {
	prepayed: 'payed',
	'client-confirmed': 'payed',
	'send-to-delivery': 'shipped',
	delivering: 'shipped',
	complete: 'delivered',
	'cancel-other': 'cancelled',
	'no-call': 'cancelled',
	'no-product': 'cancelled',
	'assembling-complete': 'ready_to_receive'
}

interface PendingSaleProduct {
	name: string
	slug: string
	salePrice: string
	regularPrice: string
	brands: string[]
	categories: string[]
}

const SALE_DEBOUNCE_MS = 2 * 60 * 1000

@Injectable()
export class WebhookService {
	private notifiedSales = new Set<string>()
	private notifiedCoupons = new Set<string>()
	private pendingSaleProducts: PendingSaleProduct[] = []
	private saleDebounceTimer: ReturnType<typeof setTimeout> | null = null

	constructor(
		private prisma: PrismaService,
		private notificationService: NotificationsService,
		private loyaltyLevel: LoyaltyLevelService,
		private wooSync: WooSyncService
	) {}

	async handleRetailCRMOrderStatus(payload: any) {
		const order = payload?.order
		if (!order?.externalId || !order?.status) return { ok: true }

		const localStatus = RETAILCRM_TO_LOCAL[order.status]
		if (!localStatus) return { ok: true }

		// externalId may be WC order ID (numeric string) or local UUID
		const wcId = parseInt(order.externalId)
		const existing = await this.prisma.order.findFirst({
			where: {
				OR: [
					{ id: order.externalId },
					...(wcId ? [{ wcOrderId: wcId }] : [])
				]
			}
		})
		if (!existing || existing.status === localStatus) return { ok: true }

		const updated = await this.prisma.order.update({
			where: { id: existing.id },
			data: { status: localStatus as any }
		})

		if (updated.userId) {
			const notification = await this.notificationService.saveNotification(
				updated.userId,
				getOrderStatusIcons(localStatus),
				`Заказ #${updated.id.slice(0, 6).toUpperCase()} ${getOrderStatusTranslation(localStatus)}`,
				{ orderUserId: updated.id, status: localStatus }
			)

			await this.notificationService.sendPushNotificationToUser(
				updated.userId,
				getOrderStatusIcons(localStatus),
				`Заказ #${updated.id.slice(0, 6).toUpperCase()} ${getOrderStatusTranslation(localStatus)}`,
				{ orderUserId: updated.id, status: localStatus, notification: notification.id }
			)

			if (localStatus === 'delivered') {
				const amountToAdd = (existing.totalPrice ?? 0) - (existing.deliveryPrice ?? 0)
				this.loyaltyLevel
					.addAmountAndUpdateLevel(updated.userId, amountToAdd)
					.then(async () => {
						const loyalty = await this.prisma.userLoyalty.findUnique({
							where: { userId: updated.userId },
							select: { currentDiscount: true }
						})
						const user = await this.prisma.user.findUnique({
							where: { id: updated.userId },
							select: { email: true }
						})
						if (loyalty?.currentDiscount && user?.email) {
							this.wooSync.updateCustomerDiscount(user.email, loyalty.currentDiscount).catch(() => null)
						}
					})
					.catch(() => null)
			}
		}

		return { ok: true }
	}

	async handleWooCommerceOrderCreated(payload: any) {
		const wcOrderId = payload?.id
		const total: string = payload?.total
		const billing = payload?.billing
		const status: string = payload?.status
		const metaData: any[] = payload?.meta_data || []
		if (!wcOrderId || !total) return { ok: true }

		// App orders are notified separately — skip
		const isAppOrder = metaData.some((m: any) => m.key === '_kc_app_order_id')
		if (isAppOrder) return { ok: true }

		const customerName = [billing?.first_name, billing?.last_name].filter(Boolean).join(' ')
		const customerLabel = customerName || billing?.email || 'с сайта'
		const shortId = String(wcOrderId).slice(-6).toUpperCase()
		const amount = Math.round(Number(total))

		if (status === 'processing') {
			await this.notificationService.sendPushNotificationToAdmins(
				'💳 Новый заказ с сайта (оплачен)',
				`Заказ #${shortId} от ${customerLabel} на ${amount}₽`,
				{ isRead: true }
			)
		} else {
			await this.notificationService.sendPushNotificationToAdmins(
				'🛍️ Новый заказ с сайта',
				`Заказ #${shortId} от ${customerLabel} на ${amount}₽ — ожидает оплаты`,
				{ isRead: true }
			)
		}

		return { ok: true }
	}

	async handleWooCommerceOrderUpdated(payload: any) {
		const wcOrderId = payload?.id
		const wcStatus = payload?.status
		const total: string = payload?.total
		const billing = payload?.billing
		if (!wcOrderId || !wcStatus) return { ok: true }

		const localStatus = WC_TO_LOCAL[wcStatus]
		if (!localStatus) return { ok: true }

		const order = await this.prisma.order.findFirst({
			where: { wcOrderId: Number(wcOrderId) }
		})

		// Site order (not in our DB) — notify admins when paid
		if (!order) {
			if (wcStatus === 'processing') {
				const customerName = [billing?.first_name, billing?.last_name].filter(Boolean).join(' ')
				const customerLabel = customerName || billing?.email || 'с сайта'
				const shortId = String(wcOrderId).slice(-6).toUpperCase()
				const amount = Math.round(Number(total || 0))
				await this.notificationService.sendPushNotificationToAdmins(
					'💳 Заказ с сайта оплачен',
					`Заказ #${shortId} от ${customerLabel} на ${amount}₽`,
					{ isRead: true }
				)
			}
			return { ok: true }
		}

		if (order.status === localStatus) return { ok: true }

		const updated = await this.prisma.order.update({
			where: { id: order.id },
			data: { status: localStatus as any }
		})

		if (updated.userId) {
			const notification = await this.notificationService.saveNotification(
				updated.userId,
				getOrderStatusIcons(localStatus),
				`Заказ #${updated.id.slice(0, 6).toUpperCase()} ${getOrderStatusTranslation(localStatus)}`,
				{ orderUserId: updated.id, status: localStatus }
			)

			await this.notificationService.sendPushNotificationToUser(
				updated.userId,
				getOrderStatusIcons(localStatus),
				`Заказ #${updated.id.slice(0, 6).toUpperCase()} ${getOrderStatusTranslation(localStatus)}`,
				{ orderUserId: updated.id, status: localStatus, notification: notification.id }
			)

			if (localStatus === 'delivered') {
				const amountToAdd = (order.totalPrice ?? 0) - (order.deliveryPrice ?? 0)
				this.loyaltyLevel
					.addAmountAndUpdateLevel(updated.userId, amountToAdd)
					.then(async () => {
						const loyalty = await this.prisma.userLoyalty.findUnique({
							where: { userId: updated.userId },
							select: { currentDiscount: true }
						})
						const user = await this.prisma.user.findUnique({
							where: { id: updated.userId },
							select: { email: true }
						})
						if (loyalty?.currentDiscount && user?.email) {
							this.wooSync.updateCustomerDiscount(user.email, loyalty.currentDiscount).catch(() => null)
						}
					})
					.catch(() => null)
			}
		}

		return { ok: true }
	}

	async handleProductCreated(payload: any) {
		const name = payload?.name
		const slug = payload?.slug
		const categories: { name: string }[] = payload?.categories ?? []
		if (!name || !slug) return { ok: true }

		const categoryName = categories[0]?.name
		const body = categoryName
			? `${name} уже в разделе «${categoryName}» — посмотрите первыми! 👀`
			: `${name} уже в магазине — посмотрите первыми! 👀`

		await this.notificationService.sendBroadcast('🌸 Новинка!', body, {
			productSlug: slug
		})

		return { ok: true }
	}

	async handleProductUpdated(payload: any) {
		const name = payload?.name
		const slug = payload?.slug
		const salePrice = payload?.sale_price
		const regularPrice = payload?.regular_price
		if (!name || !slug || !salePrice || salePrice === regularPrice) return { ok: true }

		const cacheKey = `${slug}:${salePrice}`
		if (this.notifiedSales.has(cacheKey)) return { ok: true }
		this.notifiedSales.add(cacheKey)

		const brands: string[] = (payload?.brands ?? payload?.tags ?? []).map((b: any) => b.name).filter(Boolean)
		const categories: string[] = (payload?.categories ?? []).map((c: any) => c.name).filter(Boolean)

		this.pendingSaleProducts.push({ name, slug, salePrice, regularPrice, brands, categories })

		if (this.saleDebounceTimer) clearTimeout(this.saleDebounceTimer)
		this.saleDebounceTimer = setTimeout(() => this.flushSaleNotification(), SALE_DEBOUNCE_MS)

		return { ok: true }
	}

	private async flushSaleNotification() {
		const products = this.pendingSaleProducts.splice(0)
		this.saleDebounceTimer = null
		if (products.length === 0) return

		if (products.length === 1) {
			const p = products[0]
			await this.notificationService.sendBroadcast(
				'🏷️ Скидка!',
				`Успейте! ${p.name} — было ${p.regularPrice}₽, теперь ${p.salePrice}₽ 🔥`,
				{ productSlug: p.slug }
			)
			return
		}

		const allBrands = [...new Set(products.flatMap(p => p.brands))]
		const allCategories = [...new Set(products.flatMap(p => p.categories))]

		let body: string
		let navData: object

		if (allBrands.length === 1) {
			body = `Скидки на товары бренда «${allBrands[0]}» — ${products.length} товаров! 🔥`
			navData = { categorySlug: allBrands[0].toLowerCase() }
		} else if (allCategories.length === 1) {
			body = `Скидки в разделе «${allCategories[0]}» — ${products.length} товаров! 🔥`
			navData = { categorySlug: products[0].slug }
		} else if (allBrands.length > 1) {
			body = `Скидки на ${allBrands.slice(0, 2).join(', ')} и другие — ${products.length} товаров! 🔥`
			navData = {}
		} else {
			body = `${products.length} товаров со скидками — успейте! 🔥`
			navData = {}
		}

		await this.notificationService.sendBroadcast('🏷️ Скидки!', body, navData)
	}

	async handleCouponCreated(payload: any) {
		const code: string = payload?.code
		const discountType: string = payload?.discount_type
		const amount: string = payload?.amount
		const description: string = payload?.description
		if (!code || !amount) return { ok: true }

		const cacheKey = `coupon:${code}`
		if (this.notifiedCoupons.has(cacheKey)) return { ok: true }
		this.notifiedCoupons.add(cacheKey)

		let discountText = ''
		if (discountType === 'percent') discountText = `−${amount}%`
		else if (discountType === 'fixed_cart' || discountType === 'fixed_product') discountText = `−${amount}₽`

		const body = description
			? `${description} Промокод: ${code.toUpperCase()}`
			: `${discountText ? discountText + ' ' : ''}по промокоду ${code.toUpperCase()} 🎁`

		await this.notificationService.sendBroadcast('🎁 Промокод!', body, { couponCode: code })

		return { ok: true }
	}

	async handleTermCreated(payload: any) {
		const name = payload?.name
		const slug = payload?.slug
		const isBrand = payload?.isBrand
		if (!name || !slug) return { ok: true }

		const title = isBrand ? '✨ Новый бренд!' : '🗂️ Новая категория!'
		const body = isBrand
			? `«${name}» теперь у нас — загляните, пока не разобрали!`
			: `Новый раздел «${name}» уже открыт — что там? 🛍️`

		await this.notificationService.sendBroadcast(title, body, { categorySlug: slug })
		return { ok: true }
	}

	async handlePostPublished(payload: any) {
		const title = payload?.title
		const slug = payload?.slug
		if (!title || !slug) return { ok: true }

		await this.notificationService.sendBroadcast(
			'📖 Новая статья',
			`${title} — читайте в блоге Korea Cosmos`,
			{ postSlug: slug }
		)

		return { ok: true }
	}

	async handleCustomerCreated(payload: any) {
		const email = payload?.email
		if (!email) return { ok: true }

		const existing = await this.prisma.user.findUnique({ where: { email } })
		if (existing) return { ok: true }

		await this.notificationService.sendPushNotificationToAdmins(
			'👤 Новый пользователь',
			`Зарегистрировался на сайте: ${email}`,
			{ isRead: true }
		)

		return { ok: true }
	}

	async handleCustomerUpdated(payload: any) {
		const email = payload?.email
		const billing = payload?.billing

		if (!email || !billing?.city) return { ok: true }

		const user = await this.prisma.user.findUnique({ where: { email } })
		if (!user) return { ok: true }

		const existingAddress = await this.prisma.address.findFirst({
			where: { userId: user.id, isDefault: true }
		})

		const addressData = {
			city: billing.city || '',
			region: billing.state || '',
			postCode: billing.postcode || '',
			street: billing.address_1 || '',
			apartment: billing.address_2 || '',
			house: ''
		}

		if (existingAddress) {
			await this.prisma.address.update({
				where: { id: existingAddress.id },
				data: addressData
			})
		} else if (billing.address_1 || billing.city) {
			await this.prisma.address.create({
				data: {
					...addressData,
					isDefault: true,
					userId: user.id
				}
			})
		}

		return { ok: true }
	}
}
