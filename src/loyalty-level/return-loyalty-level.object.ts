import { Prisma } from '@prisma/client'

export const returnLoyaltyLevelObject: Prisma.LoyaltyLevelSelect = {
	id: true,
	createdAt: true,
	name: true,
	discount: true,
	minAmount: true,
	userLoyalty: true
}
