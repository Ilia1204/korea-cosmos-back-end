import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationsService } from 'src/notifications/notifications.service'
import { WooApiClient } from 'src/woo-sync/woo-api.client'

interface DiscountGroup {
	name: string
	count: number
	maxDiscount: number
}

// Расписание: пятница в 11:00 МСК
// Чтобы изменить — поправь строку ниже (формат: секунда минута час день месяц деньНедели)
const REMINDER_CRON = '0 0 11 * * 5'

@Injectable()
export class WooDiscountReminderService {
	private readonly logger = new Logger(WooDiscountReminderService.name)
	// Группы, отправленные в текущем цикле — чтобы не повторяться
	private recentlyUsed = new Set<string>()

	constructor(
		private readonly woo: WooApiClient,
		private readonly notifications: NotificationsService
	) {}

	@Cron(REMINDER_CRON, { timeZone: 'Europe/Moscow' })
	async sendDiscountReminder() {
		this.logger.log('Running scheduled discount reminder...')
		try {
			const groups = await this.fetchDiscountGroups()
			if (!groups.length) {
				this.logger.log('No active discounts — skipping reminder')
				return
			}

			// Фильтруем недавно отправленные для разнообразия
			const available = groups.filter(g => !this.recentlyUsed.has(g.name))
			// Если все уже были — сбрасываем и берём снова
			if (!available.length) this.recentlyUsed.clear()
			const pool = available.length ? available : groups

			const group = this.weightedPick(pool)
			this.recentlyUsed.add(group.name)

			const { title, message } = this.buildNotification(group)
			await this.notifications.sendBroadcastPushOnly(title, message, {
				categorySlug: 'sale'
			})

			this.logger.log(
				`Reminder sent: "${title}" | group="${group.name}" products=${group.count} discount=${group.maxDiscount}%`
			)
		} catch (e) {
			this.logger.error(`Discount reminder failed: ${e}`)
		}
	}

	private async fetchDiscountGroups(): Promise<DiscountGroup[]> {
		const products: any[] = []
		let page = 1

		while (true) {
			const res = await this.woo.get('products', {
				on_sale: 'true',
				per_page: '100',
				page: String(page),
				status: 'publish',
				_fields: 'id,categories,sale_price,regular_price,type'
			})
			const data = await res.json()
			if (!Array.isArray(data) || !data.length) break
			products.push(...data)
			if (data.length < 100) break
			page++
		}

		if (!products.length) return []

		const groupMap = new Map<string, { count: number; maxDiscount: number }>()

		for (const p of products) {
			const regular = parseFloat(p.regular_price)
			const sale = parseFloat(p.sale_price)
			const discount =
				regular > 0 && sale > 0 && sale < regular
					? Math.round((1 - sale / regular) * 100)
					: 0

			for (const cat of (p.categories ?? []) as { name: string }[]) {
				if (!cat.name) continue
				const prev = groupMap.get(cat.name) ?? { count: 0, maxDiscount: 0 }
				groupMap.set(cat.name, {
					count: prev.count + 1,
					maxDiscount: Math.max(prev.maxDiscount, discount)
				})
			}
		}

		return Array.from(groupMap.entries())
			.map(([name, data]) => ({ name, ...data }))
			.filter(g => g.maxDiscount > 0 && g.count >= 2)
			.sort((a, b) => b.count - a.count)
	}

	private weightedPick(groups: DiscountGroup[]): DiscountGroup {
		const total = groups.reduce((s, g) => s + g.count, 0)
		let rand = Math.random() * total
		for (const g of groups) {
			rand -= g.count
			if (rand <= 0) return g
		}
		return groups[0]
	}

	private buildNotification(group: DiscountGroup): {
		title: string
		message: string
	} {
		const { name, count, maxDiscount } = group

		const titles = [
			`🔥 Скидки на ${name}!`,
			`✨ ${name} — специальная цена!`,
			`🛍️ Распродажа: ${name}`,
			`🎁 Акция на ${name}!`,
			`💄 ${name} со скидкой до -${maxDiscount}%`,
			`⚡️ Горячее предложение на ${name}`,
			`🌸 ${name}: выгодные цены прямо сейчас`
		]

		const messages = [
			`${count} товаров со скидкой до -${maxDiscount}% — успейте купить! 🏃‍♀️`,
			`Выгодные цены на лучшую косметику. Скидки до -${maxDiscount}%! ✨`,
			`Побалуйте себя любимой косметикой по суперцене 💅`,
			`Скидка до -${maxDiscount}% на ${count} товаров — предложение ограничено ⏰`,
			`Откройте для себя выгодные предложения прямо сейчас 🌸`,
			`Идеальный момент обновить уходовую рутину 💖`,
			`Только сейчас: ${count} товаров по специальной цене 🎉`
		]

		const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
		return { title: pick(titles), message: pick(messages) }
	}
}
