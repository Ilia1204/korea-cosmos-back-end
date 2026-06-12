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
	private readonly wcAuth =
		'Basic ' +
		Buffer.from(
			`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
		).toString('base64')

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

	async getAllByUser(userId: string, searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm, userId)
		return this.prisma.address.findMany({
			where: { userId },
			select: returnAddressObject,
			orderBy: { createdAt: 'desc' }
		})
	}

	async create(userId: string, dto: AddressDto) {
		const user = await this.userService.getById(userId)
		if (!user) throw new NotFoundException('Пользователь не найден')

		return this.prisma.$transaction(async prisma => {
			await prisma.address.updateMany({
				where: { userId, isDefault: true },
				data: { isDefault: false }
			})
			return prisma.address.create({
				data: {
					region: dto.region,
					city: dto.city,
					postCode: dto.postCode,
					street: dto.street,
					house: dto.house,
					apartment: dto.apartment,
					comment: dto.comment,
					isDefault: true,
					user: { connect: { id: userId } }
				}
			})
		})
	}

	async update(id: string, dto: AddressDto) {
		const address = await this.getById(id)
		if (!address) throw new NotFoundException('Адрес не найден')
		return this.prisma.address.update({
			where: { id },
			data: {
				region: dto.region,
				city: dto.city,
				postCode: dto.postCode,
				street: dto.street,
				house: dto.house,
				apartment: dto.apartment,
				comment: dto.comment,
				isDefault: dto.isDefault
			}
		})
	}

	async setDefault(addressId: string) {
		const address = await this.getById(addressId)
		if (!address) throw new NotFoundException('Адрес не найден')

		return this.prisma.$transaction(async prisma => {
			await prisma.address.updateMany({
				where: { userId: address.userId, isDefault: true },
				data: { isDefault: false }
			})
			return prisma.address.update({
				where: { id: addressId },
				data: { isDefault: true }
			})
		})
	}

	async deleteByUser(addressId: string, userId: string) {
		const address = await this.getById(addressId)
		if (!address) throw new NotFoundException('Адрес не найден')
		if (address.userId !== userId)
			throw new ForbiddenException('Вы не можете удалять адрес другого юзера')

		await this.prisma.address.delete({ where: { id: addressId } })
		if (address.isDefault) await this.reassignDefault(userId)
		return { message: 'Адрес успешно удален' }
	}

	async deleteByAdmin(id: string) {
		const address = await this.getById(id)
		if (!address) throw new NotFoundException('Адрес не найден')

		await this.prisma.address.delete({ where: { id } })
		if (address.isDefault) await this.reassignDefault(address.userId)
	}

	async deleteAllByUser(userId: string) {
		const exists = await this.prisma.address.count({ where: { userId } })
		if (!exists) throw new NotFoundException('У вас нет адресов для удаления')
		return this.prisma.address.deleteMany({ where: { userId } })
	}

	async importFromWooCommerce(userId: string, email: string) {
		const existing = await this.prisma.address.findFirst({ where: { userId } })
		if (existing) return

		try {
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}`,
				{ headers: { Authorization: this.wcAuth } }
			)
			const customers = await res.json()
			const customer = customers?.[0]
			if (!customer) return

			const billing = customer.billing
			const shipping = customer.shipping

			const hasBilling = billing?.city || billing?.address_1
			const hasShipping = shipping?.city || shipping?.address_1

			const billingKey = [billing?.address_1, billing?.city, billing?.postcode].join('|')
			const shippingKey = [shipping?.address_1, shipping?.city, shipping?.postcode].join('|')
			const isDifferent = hasShipping && billingKey !== shippingKey

			const toCreate = []

			if (hasBilling) {
				toCreate.push({
					userId,
					city: billing.city || '',
					region: billing.state || '',
					postCode: billing.postcode || '',
					street: billing.address_1 || '',
					apartment: billing.address_2 || '',
					house: '',
					isDefault: true
				})
			}

			if (isDifferent) {
				toCreate.push({
					userId,
					city: shipping.city || '',
					region: shipping.state || '',
					postCode: shipping.postcode || '',
					street: shipping.address_1 || '',
					apartment: shipping.address_2 || '',
					house: '',
					isDefault: false
				})
			}

			if (toCreate.length > 0) {
				await this.prisma.address.createMany({ data: toCreate })
			}
		} catch {}
	}

	async syncDefaultToWooCommerce(userId: string) {
		const [address, user] = await Promise.all([
			this.getDefault(userId),
			this.userService.getById(userId)
		])
		if (!address || !user?.email) return

		try {
			const res = await fetch(
				`${
					process.env.WP_URL
				}/wp-json/wc/v3/customers?email=${encodeURIComponent(user.email)}`,
				{ headers: { Authorization: this.wcAuth } }
			)
			const customers = await res.json()
			const customerId = customers?.[0]?.id
			if (!customerId) return

			await fetch(
				`${process.env.WP_URL}/wp-json/wc/v3/customers/${customerId}`,
				{
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: this.wcAuth
					},
					body: JSON.stringify({
						billing: {
							address_1: `${address.street} ${address.house}`.trim(),
							address_2: address.apartment || '',
							city: address.city,
							state: address.region,
							postcode: address.postCode
						}
					})
				}
			)
		} catch {}
	}

	private async search(searchTerm: string, userId?: string) {
		const fields = [
			'region',
			'city',
			'postCode',
			'street',
			'house',
			'apartment'
		]
		return this.prisma.address.findMany({
			where: {
				userId,
				OR: fields.map(field => ({
					[field]: { contains: searchTerm, mode: 'insensitive' }
				}))
			},
			select: returnAddressObject,
			orderBy: { createdAt: 'desc' }
		})
	}

	private async reassignDefault(userId: string) {
		const next = await this.prisma.address.findFirst({
			where: { userId },
			orderBy: { createdAt: 'desc' }
		})
		if (next)
			await this.prisma.address.update({
				where: { id: next.id },
				data: { isDefault: true }
			})
	}
}
