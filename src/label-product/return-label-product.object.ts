import { Prisma } from '@prisma/client'

export const returnLabelProductObject: Prisma.LabelProductSelect = {
	id: true,
	name: true,
	slug: true,
	products: {
		orderBy: {
			stock: 'desc'
		},
		select: {
			id: true,
			createdAt: true,
			name: true,
			rating: true,
			slug: true,
			images: true,
			price: true,
			weight: true,
			newPrice: true,
			discount: true,
			stock: true,
			reviews: {
				where: {
					isPublic: true
				},
				select: {
					createdAt: true,
					message: true,
					images: true,
					rating: true,
					user: {
						select: {
							name: true
						}
					}
				}
			},
			labelProductId: true,
			labelProduct: {
				select: {
					name: true
				}
			},
			categories: true,
			userId: true
		}
	}
}
