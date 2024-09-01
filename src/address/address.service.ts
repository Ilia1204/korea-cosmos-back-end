import {
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { AddressDto } from './address.dto'
import { returnAddressObject } from './address.object'

@Injectable()
export class AddressService {
	constructor(
		private prisma: PrismaService,
		private userService: UserService
	) {}

	getById(id: string) {
		return this.prisma.address.findUnique({
			where: { id },
			select: returnAddressObject
		})
	}

	getDefault(userId: string) {
		return this.prisma.address.findFirst({
			where: { isDefault: true, userId },
			select: returnAddressObject
		})
	}

	async getAll(searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm)

		return this.prisma.address.findMany({
			select: returnAddressObject,
			orderBy: { createdAt: 'desc' }
		})
	}

	async getAllByUser(id: string, searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm, id)

		return this.prisma.address.findMany({
			where: { userId: id },
			select: returnAddressObject,
			orderBy: { createdAt: 'desc' }
		})
	}

	private async search(searchTerm: string, userId?: string) {
		return await this.prisma.address.findMany({
			where: {
				userId,
				OR: [
					{
						region: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						city: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						postCode: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						street: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						house: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						apartment: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					}
				]
			},
			select: returnAddressObject,
			orderBy: { createdAt: 'desc' }
		})
	}

	async create(userId: string, dto: AddressDto) {
		const { region, city, postCode, street, house, apartment, comment } = dto

		const user = await this.userService.getById(userId)
		if (!user) throw new NotFoundException('Пользователь не найден')

		return this.prisma.$transaction(async prisma => {
			await prisma.address.updateMany({
				where: {
					userId: userId,
					isDefault: true
				},
				data: {
					isDefault: false
				}
			})

			return prisma.address.create({
				data: {
					region,
					city,
					postCode,
					street,
					house,
					apartment,
					comment,
					isDefault: true,
					user: { connect: { id: userId } }
				}
			})
		})
	}

	async update(id: string, dto: AddressDto) {
		const {
			region,
			city,
			postCode,
			street,
			house,
			apartment,
			isDefault,
			comment
		} = dto

		const address = await this.getById(id)
		if (!address) throw new NotFoundException('Адрес не найден')

		return this.prisma.address.update({
			where: { id },
			data: {
				region,
				city,
				postCode,
				street,
				house,
				apartment,
				comment,
				isDefault
			}
		})
	}

	async setDefault(addressId: string) {
		const address = await this.getById(addressId)
		if (!address) throw new NotFoundException('Адрес не найден')

		return this.prisma.$transaction(async prisma => {
			await prisma.address.updateMany({
				where: {
					userId: address.userId,
					isDefault: true
				},
				data: {
					isDefault: false
				}
			})

			return prisma.address.update({
				where: { id: addressId },
				data: { isDefault: true }
			})
		})
	}

	async deleteByUser(addressId: string, id: string) {
		const address = await this.getById(addressId)
		if (!address) throw new NotFoundException('Адрес не найден')

		if (address.userId !== id)
			throw new ForbiddenException('Вы не можете удалять адрес другого юзера')

		await this.prisma.address.delete({
			where: { id: addressId }
		})

		if (address.isDefault) {
			const lastAddedAddress = await this.prisma.address.findFirst({
				where: { userId: id },
				orderBy: { createdAt: 'desc' }
			})

			if (lastAddedAddress)
				await this.prisma.address.update({
					where: { id: lastAddedAddress.id },
					data: { isDefault: true }
				})
		}

		return { message: 'Адрес успешно удален' }
	}

	async deleteAllByUser(userId: string) {
		const addresses = await this.prisma.address.findMany({
			where: { userId }
		})

		if (!addresses.length)
			throw new NotFoundException('У вас нет адресов для удаления')

		return this.prisma.address.deleteMany({
			where: { userId }
		})
	}

	async deleteByAdmin(id: string) {
		const address = await this.getById(id)
		if (!address) throw new NotFoundException('Адрес не найден')

		await this.prisma.address.delete({
			where: { id }
		})

		if (address.isDefault) {
			const lastAddedAddress = await this.prisma.address.findFirst({
				where: { userId: address.userId },
				orderBy: { createdAt: 'desc' }
			})

			if (lastAddedAddress)
				await this.prisma.address.update({
					where: { id: lastAddedAddress.id },
					data: { isDefault: true }
				})
		}
	}
}
