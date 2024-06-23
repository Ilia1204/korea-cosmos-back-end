import { Prisma } from '@prisma/client'

export const returnCategoryObject: Prisma.CategorySelect = {
	id: true,
	name: true,
	slug: true,
	section: true,
	products: true
}
