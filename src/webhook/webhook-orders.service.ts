import { Injectable, Logger } from '@nestjs/common'
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

const STATUS_PRIORITY: Record<string, number> = {
	pending: 0,
	payed: 1,
	shipped: 2,
	ready_to_receive: 2,
	delivered: 3
}

@Injectable()
export class WebhookOrdersService {
	private readonly logger = new Logger(WebhookOrdersService.name)

	// Дедупликация: не слать два уведомления об одном WC заказе (created + updated стреляют одновременно)
	private notifiedWcOrders = new Set<string>()

	constructor(
		private readonly prisma: PrismaService,
		private readonly notifications: NotificationsService,
		private readonly loyaltyLevel: LoyaltyLevelService,
		private readonly wooSync: WooSyncService
	) {}

	async handleRetailCRMOrderStatus(payload: any) {
		const order = payload?.order
		this.logger.log(
			`[RetailCRM webhook] externalId=${order?.externalId} status=${order?.status}`
		)
		if (!order?.externalId || !order?.status) return { ok: true }

		const localStatus = RETAILCRM_TO_LOCAL[order.status]
		if (!localStatus) {
			this.logger.log(
				`[RetailCRM webhook] unmapped status "${order.status}", ignoring`
			)
			return { ok: true }
		}

		const wcId = parseInt(order.externalId)
		const existing = await this.prisma.order.findFirst({
			where: {
				OR: [{ id: order.externalId }, ...(wcId ? [{ wcOrderId: wcId }] : [])]
			}
		})

		if (!existing) {
			const customerEmail = order.customer?.email || order.email
			this.logger.log(
				`[RetailCRM webhook] no local order for externalId=${order.externalId}, email=${customerEmail}`
			)
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

		// Не понижать статус через RetailCRM webhook
		if (localStatus !== 'cancelled') {
			const curPriority = STATUS_PRIORITY[existing.status] ?? -1
			const newPriority = STATUS_PRIORITY[localStatus] ?? -1
			if (newPriority < curPriority) {
				this.logger.log(
					`[RetailCRM webhook] ignoring downgrade orderId=${existing.id} ${existing.status} → ${localStatus}`
				)
				return { ok: true }
			}
		}

		this.logger.log(
			`[RetailCRM webhook] applying orderId=${existing.id} ${existing.status} → ${localStatus}`
		)

		const trackingNumber = order.delivery?.data?.trackNumber as
			| string
			| undefined

		const guard = await this.prisma.order.updateMany({
			where: { id: existing.id, status: existing.status },
			data: {
				status: localStatus as any,
				...(trackingNumber && { trackingNumber })
			}
		})
		if (guard.count === 0) return { ok: true }

		const updated = await this.prisma.order.findUnique({
			where: { id: existing.id }
		})

		if (updated.userId) {
			await this.notifyOrderStatus(updated.userId, updated.id, localStatus)
			if (localStatus === 'delivered') {
				const amountToAdd =
					(existing.totalPrice ?? 0) - (existing.deliveryPrice ?? 0)
				await this.applyLoyaltyOnDelivery(
					updated.userId,
					amountToAdd,
					updated.id
				)
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
		await this.notifications.sendPushNotificationToUser(
			user.id,
			icon,
			title,
			{ ...data, notificationId: notification.id },
			'orders'
		)
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

		const dedupKey = `wc:${wcOrderId}`
		if (this.notifiedWcOrders.has(dedupKey)) return { ok: true }
		this.notifiedWcOrders.add(dedupKey)
		setTimeout(() => this.notifiedWcOrders.delete(dedupKey), 5 * 60 * 1000)

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

		// Передаём localOrderId если заказ уже синхронизирован в локальную БД
		const localOrder = await this.prisma.order.findFirst({
			where: { wcOrderId: Number(wcOrderId) },
			select: { id: true }
		})
		const notifData: Record<string, any> = { newWcOrder: true, wcOrderId }
		if (localOrder) notifData.orderId = localOrder.id

		await this.notifications.sendPushNotificationToAdmins(
			title,
			body,
			notifData
		)
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
				const dedupKey = `wc:${wcOrderId}`
				if (!this.notifiedWcOrders.has(dedupKey)) {
					this.notifiedWcOrders.add(dedupKey)
					setTimeout(
						() => this.notifiedWcOrders.delete(dedupKey),
						5 * 60 * 1000
					)
					const customerName = [billing?.first_name, billing?.last_name]
						.filter(Boolean)
						.join(' ')
					const customerLabel = customerName || billing?.email || 'с сайта'
					const shortId = String(wcOrderId).slice(-6).toUpperCase()
					const amount = Math.round(Number(total || 0))
					await this.notifications.sendPushNotificationToAdmins(
						'💳 Заказ с сайта оплачен',
						`Заказ #${shortId} от ${customerLabel} на ${amount}₽`,
						{ newWcOrder: true, wcOrderId }
					)
				}
			}
			return { ok: true }
		}

		if (order.status === localStatus) return { ok: true }

		if (localStatus !== 'cancelled') {
			const curPriority = STATUS_PRIORITY[order.status] ?? -1
			const newPriority = STATUS_PRIORITY[localStatus] ?? -1
			if (newPriority < curPriority) return { ok: true }
		}

		const guard = await this.prisma.order.updateMany({
			where: { id: order.id, status: order.status },
			data: { status: localStatus as any }
		})
		if (guard.count === 0) return { ok: true }

		const updated = await this.prisma.order.findUnique({
			where: { id: order.id }
		})

		if (updated.userId) {
			await this.notifyOrderStatus(updated.userId, updated.id, localStatus)
			if (localStatus === 'delivered') {
				const amountToAdd = (order.totalPrice ?? 0) - (order.deliveryPrice ?? 0)
				await this.applyLoyaltyOnDelivery(
					updated.userId,
					amountToAdd,
					updated.id
				)
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
		await this.notifications.sendPushNotificationToUser(
			userId,
			icon,
			title,
			{ ...data, notificationId: notification.id },
			'orders'
		)
	}

	private async applyLoyaltyOnDelivery(
		userId: string,
		amountToAdd: number,
		orderId: string
	) {
		this.loyaltyLevel
			.addAmountAndUpdateLevel(userId, amountToAdd, {
				orderId,
				reason: `Заказ #${orderId.slice(0, 6).toUpperCase()} доставлен`
			})
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
