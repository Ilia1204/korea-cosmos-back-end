import { Injectable } from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { getOrderStatusIcons, getOrderStatusTranslation } from 'src/utils/translate-status'

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

@Injectable()
export class WebhookService {
	constructor(
		private prisma: PrismaService,
		private notificationService: NotificationsService
	) {}

	async handleRetailCRMOrderStatus(payload: any) {
		const order = payload?.order
		if (!order?.externalId || !order?.status) return { ok: true }

		const localStatus = RETAILCRM_TO_LOCAL[order.status]
		if (!localStatus) return { ok: true }

		const existing = await this.prisma.order.findUnique({
			where: { id: order.externalId }
		})
		if (!existing || existing.status === localStatus) return { ok: true }

		const updated = await this.prisma.order.update({
			where: { id: order.externalId },
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
		}

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
