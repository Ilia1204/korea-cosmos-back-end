import { Prisma } from '@prisma/client'

export const returnPostObject: Prisma.PostSelect = {
	id: true,
	title: true,
	description: true,
	createdAt: true,
	slug: true,
	image: true,
	countViews: true
}

export const returnFullestPostObject: Prisma.PostSelect = {
	...returnPostObject,
	isPublic: true
}
