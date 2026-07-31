import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { LoyaltyLevelDto, UpdateLoyaltyLevelDto } from './loyalty-level.dto'
import { returnLoyaltyLevelObject } from './return-loyalty-level.object'

interface CrmLoyaltyLevel {
	id: number
	name: string
	privilegeSumPercent?: number
	requiredSumTotal?: number
}

@Injectable()
export class LoyaltyLevelService {
	private readonly logger = new Logger(LoyaltyLevelService.name)
	private readonly crmUrl: string
	private readonly crmApiKey: string

	constructor(
		private prisma: PrismaService,
		private notifications: NotificationsService,
		private config: ConfigService
	) {
		this.crmUrl = this.config.get('RETAILCRM_URL') || 'https://koreacosmos.retailcrm.ru'
		this.crmApiKey = this.config.get('RETAILCRM_API_KEY')
	}

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
			orderBy: { minAmount: 'asc' }
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

	async create(dto: LoyaltyLevelDto = {}) {
		return this.prisma.loyaltyLevel.create({
			data: {
				name: dto.name ?? 'Новый уровень',
				discount: dto.discount ?? 0,
				minAmount: dto.minAmount ?? 0
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

	async syncFromRetailCrm(): Promise<{ synced: number; created: number; updated: number }> {
		if (!this.crmApiKey) throw new Error('RETAILCRM_API_KEY не настроен')

		// Получаем список программ лояльности
		const loyaltiesRes = await fetch(`${this.crmUrl}/api/v5/loyalty/loyalties`, {
			headers: { 'X-API-KEY': this.crmApiKey }
		})
		const loyaltiesData = await loyaltiesRes.json()
		this.logger.log(`RetailCRM loyalties response: ${JSON.stringify(loyaltiesData)}`)

		if (!loyaltiesData.success || !loyaltiesData.loyalties?.length) {
			throw new Error(`Программы лояльности не найдены: ${JSON.stringify(loyaltiesData)}`)
		}

		// Берём первую активную программу
		const program = loyaltiesData.loyalties.find((l: any) => l.active) ?? loyaltiesData.loyalties[0]
		this.logger.log(`Using loyalty program id=${program.id} name="${program.name}"`)

		// Получаем детали программы (включая уровни)
		const programRes = await fetch(`${this.crmUrl}/api/v5/loyalty/loyalties/${program.id}`, {
			headers: { 'X-API-KEY': this.crmApiKey }
		})
		const programData = await programRes.json()
		this.logger.log(`RetailCRM program detail: ${JSON.stringify(programData)}`)

		if (!programData.success) {
			throw new Error(`RetailCRM вернул ошибку: ${JSON.stringify(programData)}`)
		}

		// Уровни могут быть в loyaltyLevels или levels
		const crmLevels: CrmLoyaltyLevel[] =
			programData.loyaltyLevels ?? programData.loyalty?.loyaltyLevels ?? []
		if (!crmLevels.length) {
			return { synced: 0, created: 0, updated: 0 }
		}

		const existing = await this.prisma.loyaltyLevel.findMany()
		let created = 0
		let updated = 0

		for (const crmLevel of crmLevels) {
			const discount = Math.round(crmLevel.privilegeSumPercent ?? 0)
			const minAmount = Math.round(crmLevel.requiredSumTotal ?? 0)
			const match = existing.find(e => e.name === crmLevel.name)

			if (match) {
				await this.prisma.loyaltyLevel.update({
					where: { id: match.id },
					data: { discount, minAmount }
				})
				updated++
			} else {
				await this.prisma.loyaltyLevel.create({
					data: { name: crmLevel.name, discount, minAmount }
				})
				created++
			}
		}

		this.logger.log(`RetailCRM loyalty sync: created=${created} updated=${updated}`)
		return { synced: crmLevels.length, created, updated }
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

	async subtractAmountAndUpdateLevel(userId: string, amount: number) {
		const userLoyalty = await this.prisma.userLoyalty.findUnique({ where: { userId } })
		if (!userLoyalty) return

		const newTotal = Math.max(0, userLoyalty.totalAmountSpent - amount)
		const updated = await this.prisma.userLoyalty.update({
			where: { userId },
			data: { totalAmountSpent: newTotal }
		})

		await this.applyLevelChange(userId, updated)
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
					.sendPushNotificationToUser(userId, title, body, {
						discount: newLevel
					})
					.catch(() => {})
			}, 5000)
		}
	}
}
