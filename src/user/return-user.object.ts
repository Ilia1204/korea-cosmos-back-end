import { Prisma } from '@prisma/client'

export const returnUserObject: Prisma.UserSelect = {
	id: true,
	createdAt: true,
	email: true,
	password: false,
	role: true,
	deletedAt: true,
	name: true,
	surname: true,
	displayName: true,
	avatarPath: true,
	dateOfBirth: true,
	phone: true,
	resetPasswordCount: true,
	emailVerified: true,
	pushToken: true,
	addresses: true
}
