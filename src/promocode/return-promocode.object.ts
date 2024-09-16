import { Prisma } from '@prisma/client'

export const returnPromoCodeObject: Prisma.PromoCodeSelect = {
	id: true,
	code: true,
	description: true,
	createdAt: true,
	categories: true,
	discount: true,
	minOrderSum: true,
	expiryDate: true,
	isActive: true
}
