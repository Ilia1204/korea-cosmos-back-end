import { Prisma } from '@prisma/client'

export const returnAddressObject: Prisma.AddressSelect = {
	id: true,
	createdAt: true,
	region: true,
	city: true,
	postCode: true,
	street: true,
	house: true,
	apartment: true,
	isDefault: true,
	comment: true,
	userId: true
}
