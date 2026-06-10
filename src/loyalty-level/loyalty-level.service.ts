import { Injectable, NotFoundException } from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { LoyaltyLevelDto, UpdateLoyaltyLevelDto } from './loyalty-level.dto'
import { returnLoyaltyLevelObject } from './return-loyalty-level.object'

@Injectable()
export class LoyaltyLevelService {
	constructor(
		private prisma: PrismaService,
		private notifications: NotificationsService
	) {}

	async getById(id: string) {
		const loyaltyLevel = await this.prisma.loyaltyLevel.findUnique({
			where: { id },
			select: returnLoyaltyLevelObject
		})

		if (!loyaltyLevel)
			throw new NotFoundException('Уровень лояльности не найден')

		return loyaltyLevel
	}

	async getAll(searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm)

		return this.prisma.loyaltyLevel.findMany({
			select: returnLoyaltyLevelObject,
			orderBy: { createdAt: 'desc' }
		})
	}

	private async search(searchTerm: string) {
		return this.prisma.loyaltyLevel.findMany({
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

	async checkAndUpdateLevel(userId: string) {
		const userLoyalty = await this.prisma.userLoyalty.findUnique({
			where: { userId },
			include: { level: true }
		})
		if (!userLoyalty) return

		await this.applyLevelChange(userId, userLoyalty)
	}

	async addAmountAndUpdateLevel(userId: string, amount: number) {
		const userLoyalty = await this.prisma.userLoyalty.upsert({
			where: { userId },
			update: { totalAmountSpent: { increment: amount } },
			create: { userId, totalAmountSpent: amount, currentDiscount: 0 }
		})

		await this.applyLevelChange(userId, userLoyalty)
	}

	private async applyLevelChange(userId: string, userLoyalty: any) {
		const newLevel = await this.prisma.loyaltyLevel.findFirst({
			where: { minAmount: { lte: userLoyalty.totalAmountSpent } },
			orderBy: { minAmount: 'desc' }
		})
		if (!newLevel || userLoyalty.levelId === newLevel.id) return

		const discountChanged = userLoyalty.currentDiscount !== newLevel.discount
		await this.prisma.userLoyalty.update({
			where: { userId },
			data: { currentDiscount: newLevel.discount, levelId: newLevel.id }
		})

		if (discountChanged) {
			const title = `🌟 Новый статус — «${newLevel.name}»!`
			const body = `Поздравляем! Теперь ваша персональная скидка составляет ${newLevel.discount}%.`
			setTimeout(() => {
				this.notifications
					.saveNotification(userId, title, body, { discount: newLevel })
					.catch(() => {})
				this.notifications
					.sendPushNotificationToUser(userId, title, body, { discount: newLevel })
					.catch(() => {})
			}, 5000)
		}
	}
}
