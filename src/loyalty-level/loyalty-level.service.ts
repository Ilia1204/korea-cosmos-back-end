import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { LoyaltyLevelDto, UpdateLoyaltyLevelDto } from './loyalty-level.dto'
import { returnLoyaltyLevelObject } from './return-loyalty-level.object'

@Injectable()
export class LoyaltyLevelService {
	constructor(private prisma: PrismaService) {}

	async getById(id: string) {
		const loyaltyLevel = await this.prisma.loyaltyLevel.findUnique({
			where: { id },
			select: returnLoyaltyLevelObject
		})

		if (!loyaltyLevel)
			throw new NotFoundException('Уровень лояльности не найден')
	}

	async getAll(searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm)

		return this.prisma.loyaltyLevel.findMany({
			select: returnLoyaltyLevelObject,
			orderBy: { createdAt: 'desc' }
		})
	}

	private async search(searchTerm: string) {
		return await this.prisma.loyaltyLevel.findMany({
			where: {
				OR: [
					{
						name: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					}
				]
			},
			select: returnLoyaltyLevelObject,
			orderBy: { createdAt: 'desc' }
		})
	}

	async create(dto: LoyaltyLevelDto) {
		const { name, discount, minAmount } = dto

		return this.prisma.loyaltyLevel.create({
			data: {
				name,
				discount,
				minAmount
			}
		})
	}

	async update(id: string, dto: UpdateLoyaltyLevelDto) {
		const { name, discount, minAmount } = dto
		await this.getById(id)

		return this.prisma.loyaltyLevel.update({
			where: { id },
			data: {
				name,
				discount,
				minAmount
			}
		})
	}

	async delete(id: string) {
		await this.getById(id)

		await this.prisma.loyaltyLevel.delete({
			where: { id }
		})
	}
}
