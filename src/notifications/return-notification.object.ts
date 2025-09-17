import { Prisma } from '@prisma/client'

export const returnNotificationObject: Prisma.NotificationSelect = {
	id: true,
	title: true,
	createdAt: true,
	isRead: true,
	body: true,
	data: true,
	user: true
}
