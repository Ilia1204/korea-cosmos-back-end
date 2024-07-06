import { Prisma } from '@prisma/client'

export const returnReviewObject: Prisma.ReviewSelect = {
	id: true,
	message: true,
	images: true,
	createdAt: true,
	rating: true,
	user: true
}

export const returnFullestReviewObject: Prisma.ReviewSelect = {
	...returnReviewObject,
	isPublic: true
}
