import { Injectable } from '@nestjs/common'
import { LoyaltyLevelService } from 'src/loyalty-level/loyalty-level.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { RETAILCRM_TO_LOCAL } from 'src/retailcrm-sync/retailcrm-status.constants'
import {
	getOrderStatusIcons,
	getOrderStatusTranslation
} from 'src/utils/translate-status'
import { WooSyncService } from 'src/woo-sync/woo-sync.service'
import { WC_TO_LOCAL } from 'src/woo-sync/woo-status.constants'

@Injectable()
export class WebhookOrdersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly notifications: NotificationsService,
		private readonly loyaltyLevel: LoyaltyLevelService,
		private readonly wooSync: WooSyncService
	) {}

	async handleRetailCRMOrderStatus(payload: any) {
		const order = payload?.order
		if (!order?.externalId || !order?.status) return { ok: true }

		const localStatus = RETAILCRM_TO_LOCAL[order.status]
		if (!localStatus) return { ok: true }

		const wcId = parseInt(order.externalId)
		const existing = await this.prisma.order.findFirst({
			where: {
				OR: [{ id: order.externalId }, ...(wcId ? [{ wcOrderId: wcId }] : [])]
			}
		})

		if (!existing) {
			// Заказ с сайта без записи в локальной БД: ищем пользователя по email
			const customerEmail = order.customer?.email || order.email
			if (customerEmail) {
				await this.notifyUserByEmail(
					customerEmail,
					order.externalId,
					localStatus
				)
			}
			return { ok: true }
		}

		if (existing.status === localStatus) return { ok: true }

		const trackingNumber = order.delivery?.data?.trackNumber as
			| string
			| undefined

		const updated = await this.prisma.order.update({
			where: { id: existing.id },
			data: {
				status: localStatus as any,
				...(trackingNumber && { trackingNumber })
			}
		})

		if (updated.userId) {
			await this.notifyOrderStatus(updated.userId, updated.id, localStatus)
			const amountToAdd =
				(existing.totalPrice ?? 0) - (existing.deliveryPrice ?? 0)
			// Онлайн-оплата: засчитываем при оплате
			// Наличные: засчитываем при доставке (статус до этого не был payed)
			if (
				localStatus === 'payed' ||
				(localStatus === 'delivered' && existing.status !== 'payed')
			) {
				await this.applyLoyaltyOnDelivery(updated.userId, amountToAdd)
			}
		}

		return { ok: true }
	}

	private async notifyUserByEmail(
		email: string,
		externalId: string,
		localStatus: string
	) {
		const user = await this.prisma.user.findFirst({
			where: { email },
			select: { id: true }
		})
		if (!user) return

		const shortId = String(externalId).slice(-6).toUpperCase()
		const icon = getOrderStatusIcons(localStatus)
		const title = `Заказ #${shortId} ${getOrderStatusTranslation(localStatus)}`
		const data = { status: localStatus }

		const notification = await this.notifications.saveNotification(
			user.id,
			icon,
			title,
			data
		)
		await this.notifications.sendPushNotificationToUser(user.id, icon, title, {
			...data,
			notification: notification.id
		})
	}

	async handleWooCommerceOrderCreated(payload: any) {
		const wcOrderId = payload?.id
		const total: string = payload?.total
		const billing = payload?.billing
		const status: string = payload?.status
		const metaData: any[] = payload?.meta_data || []
		if (!wcOrderId || !total) return { ok: true }

		const isAppOrder = metaData.some((m: any) => m.key === '_kc_app_order_id')
		if (isAppOrder) return { ok: true }

		const customerName = [billing?.first_name, billing?.last_name]
			.filter(Boolean)
			.join(' ')
		const customerLabel = customerName || billing?.email || 'с сайта'
		const shortId = String(wcOrderId).slice(-6).toUpperCase()
		const amount = Math.round(Number(total))

		const title =
			status === 'processing'
				? '💳 Новый заказ с сайта (оплачен)'
				: '🛍️ Новый заказ с сайта'
		const body =
			status === 'processing'
				? `Заказ #${shortId} от ${customerLabel} на ${amount}₽`
				: `Заказ #${shortId} от ${customerLabel} на ${amount}₽ — ожидает оплаты`

		await this.notifications.sendPushNotificationToAdmins(title, body, {
			newWcOrder: true
		})
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

		if (!order) {
			if (wcStatus === 'processing') {
				const customerName = [billing?.first_name, billing?.last_name]
					.filter(Boolean)
					.join(' ')
				const customerLabel = customerName || billing?.email || 'с сайта'
				const shortId = String(wcOrderId).slice(-6).toUpperCase()
				const amount = Math.round(Number(total || 0))
				await this.notifications.sendPushNotificationToAdmins(
					'💳 Заказ с сайта оплачен',
					`Заказ #${shortId} от ${customerLabel} на ${amount}₽`,
					{ newWcOrder: true }
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
			await this.notifyOrderStatus(updated.userId, updated.id, localStatus)
			const amountToAdd = (order.totalPrice ?? 0) - (order.deliveryPrice ?? 0)
			if (
				localStatus === 'payed' ||
				(localStatus === 'delivered' && order.status !== 'payed')
			) {
				await this.applyLoyaltyOnDelivery(updated.userId, amountToAdd)
			}
		}

		return { ok: true }
	}

	private async notifyOrderStatus(
		userId: string,
		orderId: string,
		localStatus: string
	) {
		const icon = getOrderStatusIcons(localStatus)
		const title = `Заказ #${orderId
			.slice(0, 6)
			.toUpperCase()} ${getOrderStatusTranslation(localStatus)}`
		const data = { orderUserId: orderId, status: localStatus }
		const notification = await this.notifications.saveNotification(
			userId,
			icon,
			title,
			data
		)
		await this.notifications.sendPushNotificationToUser(userId, icon, title, {
			...data,
			notification: notification.id
		})
	}

	private async applyLoyaltyOnDelivery(userId: string, amountToAdd: number) {
		this.loyaltyLevel
			.addAmountAndUpdateLevel(userId, amountToAdd)
			.then(async () => {
				const [loyalty, user] = await Promise.all([
					this.prisma.userLoyalty.findUnique({
						where: { userId },
						select: { currentDiscount: true }
					}),
					this.prisma.user.findUnique({
						where: { id: userId },
						select: { email: true }
					})
				])
				if (loyalty?.currentDiscount && user?.email) {
					this.wooSync
						.updateCustomerDiscount(user.email, loyalty.currentDiscount)
						.catch(() => null)
				}
			})
			.catch(() => null)
	}
}
