import { Injectable } from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'

@Injectable()
export class WebhookCustomersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly notifications: NotificationsService
	) {}

	async handleCustomerCreated(payload: any) {
		const email = payload?.email
		if (!email) return { ok: true }

		const existing = await this.prisma.user.findUnique({ where: { email } })
		if (existing) return { ok: true }

		await this.notifications.sendPushNotificationToAdmins(
			'👤 Новый пользователь',
			`Зарегистрировался на сайте: ${email}`,
			{ newUser: true }
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
				data: { ...addressData, isDefault: true, userId: user.id }
			})
		}

		return { ok: true }
	}
}
