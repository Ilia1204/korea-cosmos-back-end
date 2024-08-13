import { Prisma } from '@prisma/client'

export const returnCarouselObject: Prisma.CarouselSelect = {
	id: true,
	imagePath: true,
	bannerType: true,
	bannerSlug: true,
	createdAt: true,
	order: true
}
