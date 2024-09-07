import { Prisma } from '@prisma/client'

export const returnUserObject: Prisma.UserSelect = {
	id: true,
	createdAt: true,
	email: true,
	password: false,
	isAdmin: true,
	name: true,
	surname: true,
	avatarPath: true,
	phone: true,
	resetPasswordCount: true,
	pushToken: true,
	addresses: true
}
