import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { NotificationsService } from 'src/notifications/notifications.service'

const SALE_DEBOUNCE_MS = 2 * 60 * 1000

interface PendingSaleProduct {
	name: string
	slug: string
	salePrice: string
	regularPrice: string
	brands: string[]
	categories: string[]
}

@Injectable()
export class WebhookProductsService {
	private notifiedSales = new Set<string>()
	private notifiedCoupons = new Set<string>()
	private pendingSaleProducts: PendingSaleProduct[] = []
	private saleDebounceTimer: ReturnType<typeof setTimeout> | null = null

	constructor(
		private readonly notifications: NotificationsService,
		private readonly prisma: PrismaService
	) {}

	async handleProductCreated(payload: any) {
		const name = payload?.name
		const slug = payload?.slug
		const categories: { name: string }[] = payload?.categories ?? []
		if (!name || !slug) return { ok: true }

		const categoryName = categories[0]?.name
		const body = categoryName
			? `${name} уже в разделе «${categoryName}» — посмотрите первыми! 👀`
			: `${name} уже в магазине — посмотрите первыми! 👀`

		await this.notifications.sendBroadcast('🌸 Новинка!', body, {
			productSlug: slug
		})
		return { ok: true }
	}

	async handleProductUpdated(payload: any) {
		const name = payload?.name
		const slug = payload?.slug
		const salePrice = payload?.sale_price
		const regularPrice = payload?.regular_price
		if (!name || !slug || !salePrice || salePrice === regularPrice)
			return { ok: true }

		const cacheKey = `${slug}:${salePrice}`
		if (this.notifiedSales.has(cacheKey)) return { ok: true }
		this.notifiedSales.add(cacheKey)

		// Личные уведомления пользователям, у которых товар в избранном
		this.notifications
			.notifyFavoriteUsersAboutPriceDrop(slug, name, salePrice, regularPrice)
			.catch(() => {})

		const brands: string[] = (payload?.brands ?? payload?.tags ?? [])
			.map((b: any) => b.name)
			.filter(Boolean)
		const categories: string[] = (payload?.categories ?? [])
			.map((c: any) => c.name)
			.filter(Boolean)

		this.pendingSaleProducts.push({
			name,
			slug,
			salePrice,
			regularPrice,
			brands,
			categories
		})

		if (this.saleDebounceTimer) clearTimeout(this.saleDebounceTimer)
		this.saleDebounceTimer = setTimeout(
			() => this.flushSaleNotification(),
			SALE_DEBOUNCE_MS
		)

		return { ok: true }
	}

	async handleCouponCreated(payload: any) {
		const code: string = payload?.code
		const discountType: string = payload?.discount_type
		const amount: string = payload?.amount
		const description: string = payload?.description
		const emailRestrictions: string[] = payload?.email_restrictions ?? []
		if (!code || !amount) return { ok: true }

		const cacheKey = `coupon:${code}`
		if (this.notifiedCoupons.has(cacheKey)) return { ok: true }
		this.notifiedCoupons.add(cacheKey)

		let discountText = ''
		if (discountType === 'percent') discountText = `−${amount}%`
		else if (discountType === 'fixed_cart' || discountType === 'fixed_product')
			discountText = `−${amount}₽`

		// Персональный купон: телефон в описании (напр. "79510995127 Ермилова Надежда")
		const phoneMatch = description?.match(/[78]\d{10}/)
		if (phoneMatch) {
			let phone = phoneMatch[0]
			if (phone.startsWith('8')) phone = '7' + phone.slice(1)

			const user = await this.prisma.user.findFirst({
				where: {
					phone: { in: [phone, '+' + phone] },
					pushToken: { not: null }
				},
				select: { id: true }
			})
			if (user) {
				const personalTitle = '🎁 Ваш промокод ко дню рождения!'
				const personalBody = `${
					discountText ? discountText + ' ' : ''
				}по промокоду ${code.toUpperCase()} — для заказа на сайте. В приложении скидка считается автоматически 🎂`
				const notification = await this.notifications.saveNotification(
					user.id,
					personalTitle,
					personalBody,
					{ couponCode: code }
				)
				await this.notifications.sendPushNotificationToUser(
					user.id,
					personalTitle,
					personalBody,
					{ couponCode: code, notificationId: notification.id }
				)
				return { ok: true }
			}
		}

		const body = description
			? `${description} Промокод: ${code.toUpperCase()}`
			: `${
					discountText ? discountText + ' ' : ''
			  }по промокоду ${code.toUpperCase()} 🎁`

		// email_restrictions — запасной вариант
		if (emailRestrictions.length > 0) {
			const users = await this.prisma.user.findMany({
				where: {
					email: { in: emailRestrictions.map(e => e.toLowerCase()) },
					pushToken: { not: null }
				},
				select: { id: true }
			})
			for (const user of users) {
				await this.notifications.sendPushNotificationToUser(
					user.id,
					'🎁 Промокод для вас!',
					body,
					{ couponCode: code }
				)
			}
			return { ok: true }
		}

		// Публичный купон — отправляем всем
		await this.notifications.sendBroadcast('🎁 Промокод!', body, {
			couponCode: code
		})
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

		await this.notifications.sendBroadcast(title, body, { categorySlug: slug })
		return { ok: true }
	}

	async handlePostPublished(payload: any) {
		const title = payload?.title
		const slug = payload?.slug
		if (!title || !slug) return { ok: true }

		await this.notifications.sendBroadcast(
			'📖 Новая статья',
			`${title} — читайте в блоге Korea Cosmos`,
			{ postSlug: slug }
		)
		return { ok: true }
	}

	private async flushSaleNotification() {
		const products = this.pendingSaleProducts.splice(0)
		this.saleDebounceTimer = null
		if (products.length === 0) return

		if (products.length === 1) {
			const p = products[0]
			await this.notifications.sendBroadcast(
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
			body = `Скидки на ${allBrands.slice(0, 2).join(', ')} и другие — ${
				products.length
			} товаров! 🔥`
			navData = {}
		} else {
			body = `${products.length} товаров со скидками — успейте! 🔥`
			navData = {}
		}

		await this.notifications.sendBroadcast('🏷️ Скидки!', body, navData)
	}
}
