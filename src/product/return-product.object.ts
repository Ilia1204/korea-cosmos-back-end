import { Prisma } from '@prisma/client'
import { returnCategoryObject } from 'src/category/return-category.object'
import { returnReviewObject } from 'src/review/return-review.object'

export const returnProductObject: Prisma.ProductSelect = {
	images: true,
	description: true,
	id: true,
	name: true,
	price: true,
	createdAt: true,
	composition: true,
	slug: true,
	newPrice: true,
	rating: true,
	inStock: true,
	weight: true,
	isPublic: true,
	countOpened: true,
	labelProduct: true,
	discount: true,
	categories: { select: { ...returnCategoryObject, products: false } },
	reviews: {
		where: {
			isPublic: true
		},
		select: returnReviewObject,
		orderBy: {
			createdAt: 'desc'
		}
	}
}

export const returnFullestProductObject: Prisma.ProductSelect = {
	...returnProductObject,
	isPublic: true,
	countOpened: true,
	countReviews: true,
	ordersCount: true
}
