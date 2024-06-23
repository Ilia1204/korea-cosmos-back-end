import { Prisma } from '@prisma/client'

export const returnSectionObject: Prisma.SectionSelect = {
	id: true,
	name: true,
	slug: true,
	categories: true
}
