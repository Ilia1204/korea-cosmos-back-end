import { Prisma } from '@prisma/client'

export const returnPostObject: Prisma.PostSelect = {
	id: true,
	title: true,
	createdAt: true,
	description: true,
	slug: true,
	image: true,
	countViews: true,
	countLikes: true,
	likesIdsUsers: true
}

export const returnFullestPostObject: Prisma.PostSelect = {
	...returnPostObject,
	isPublic: true
}
