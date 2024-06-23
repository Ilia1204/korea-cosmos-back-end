import { Prisma } from '@prisma/client'

export const returnLabelProductObject: Prisma.LabelProductSelect = {
	id: true,
	name: true,
	slug: true,
	products: {
		select: {
			id: true,
			createdAt: true,
			name: true,
			rating: true,
			slug: true,
			images: true,
			price: true,
			stock: true,
			labelProductId: true,
			labelProduct: {
				select: {
					name: true
				}
			},
			categoryId: true,
			userId: true
		}
	}
}
