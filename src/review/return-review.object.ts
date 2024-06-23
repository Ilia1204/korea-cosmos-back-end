import { Prisma } from '@prisma/client'

export const returnReviewObject: Prisma.ReviewSelect = {
	id: true,
	message: true,
	imagePath: true,
	createdAt: true,
	rating: true
}

export const returnFullestReviewObject: Prisma.ReviewSelect = {
	...returnReviewObject,
	isPublic: true
}
