import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { PromoCodeDto } from './promocode.dto'
import { returnPromoCodeObject } from './return-promocode.object'
// import { returnPromoCodeObject } from './return-promoCode.object'

@Injectable()
export class PromoCodeService {
	constructor(private prisma: PrismaService) {}

	getById(id: string) {
		return this.prisma.promoCode.findUnique({
			where: { id },
			select: returnPromoCodeObject
		})
	}

	async getAll(searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm)

		return this.prisma.promoCode.findMany({
			select: returnPromoCodeObject
		})
	}

	private async search(searchTerm: string) {
		return this.prisma.promoCode.findMany({
			where: {
				OR: [
					{
						code: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						description: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						categories: {
							some: {
								name: {
									contains: searchTerm,
									mode: 'insensitive'
								}
							}
						}
					},
					{
						products: {
							some: {
								name: {
									contains: searchTerm,
									mode: 'insensitive'
								}
							}
						}
					},
					{
						labels: {
							some: {
								name: {
									contains: searchTerm,
									mode: 'insensitive'
								}
							}
						}
					},
					{
						sections: {
							some: {
								name: {
									contains: searchTerm,
									mode: 'insensitive'
								}
							}
						}
					}
				]
			}
		})
	}

	async create() {
		return this.prisma.promoCode.create({
			data: {
				code: '',
				discount: 0
			}
		})
	}

	async update(id: string, dto: PromoCodeDto) {
		const promoCode = await this.getAll(id)
		if (!promoCode) throw new NotFoundException('Промокод не найден')

		const { code, discount, description, expiryDate, minOrderSum, isActive } =
			dto

		return this.prisma.promoCode.update({
			where: { id },
			data: {
				code,
				discount,
				description,
				expiryDate,
				minOrderSum,
				isActive
			}
		})
	}

	async delete(id: string) {
		const promoCode = await this.getById(id)
		if (!promoCode) throw new NotFoundException('Промокод не найден')

		return this.prisma.promoCode.delete({
			where: { id }
		})
	}
}
