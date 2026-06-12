import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { hash } from 'argon2'
import axios from 'axios'
import { AuthDto } from 'src/auth/dto/auth.dto'
import { PrismaService } from 'src/prisma.service'
import { returnNotificationObject } from './../notifications/return-notification.object'
import { returnUserObject } from './return-user.object'
import { UserDto } from './user.dto'

@Injectable()
export class UserService {
	constructor(private prisma: PrismaService) {}

	async getById(id: string, selectObject: Prisma.UserSelect = {}) {
		const user = await this.prisma.user.findUnique({
			where: { id },
			select: {
				...returnUserObject,
				favoriteIds: true,
				userLoyalty: {
					select: {
						level: true,
						currentDiscount: true,
						createdAt: true,
						totalAmountSpent: true
					}
				},
				notifications: {
					select: { ...returnNotificationObject, user: false }
				},
				...selectObject
			}
		})

		const totalAmountSpent = user?.userLoyalty?.totalAmountSpent || 0

		const loyaltyLevels = await this.prisma.loyaltyLevel.findMany({
			orderBy: { minAmount: 'asc' }
		})

		const currentLevelId = user?.userLoyalty?.levelId
		const currentLevel = currentLevelId
			? loyaltyLevels.find(l => l.id === currentLevelId)
			: null

		const nextLevel = loyaltyLevels.find(level => {
			if (currentLevel && level.minAmount <= currentLevel.minAmount) return false
			return level.minAmount > totalAmountSpent
		})

		return {
			...user,
			nextLevel: nextLevel || null
		}
	}

	getByEmail(email: string) {
		return this.prisma.user.findUnique({
			where: {
				email
			}
		})
	}

	async getAll(searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm)

		return this.prisma.user.findMany({
			select: {
				...returnUserObject,
				avatarPath: false,
				resetPasswordCount: false,
				addresses: false
			},
			orderBy: {
				createdAt: 'desc'
			}
		})
	}

	private async search(searchTerm: string) {
		return this.prisma.user.findMany({
			where: {
				OR: [
					{
						email: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						name: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						surname: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						addresses: {
							some: {
								region: {
									contains: searchTerm,
									mode: 'insensitive'
								},
								city: {
									contains: searchTerm,
									mode: 'insensitive'
								},
								street: {
									contains: searchTerm,
									mode: 'insensitive'
								},
								house: {
									contains: searchTerm,
									mode: 'insensitive'
								},
								apartment: {
									contains: searchTerm,
									mode: 'insensitive'
								},
								postCode: {
									contains: searchTerm,
									mode: 'insensitive'
								}
							}
						}
					},
					{
						phone: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					}
				]
			}
		})
	}

	async updatePassword(id: string, password: string) {
		return this.prisma.user.update({
			where: { id },
			data: { password }
		})
	}

	async create(dto: AuthDto) {
		const user = {
			email: dto.email,
			password: await hash(dto.password)
		}

		return this.prisma.user.create({
			data: user
		})
	}

	async createFromWordPress(
		email: string,
		password: string,
		displayName: string
	) {
		const wcCustomer = await this.getWooCommerceCustomer(email)
		const user = await this.prisma.user.create({
			data: {
				email,
				password: await hash(password),
				displayName: displayName || '',
				name: wcCustomer?.first_name || '',
				surname: wcCustomer?.last_name || '',
				phone: wcCustomer?.billing?.phone || ''
			}
		})

		const phone = wcCustomer?.billing?.phone
		this.syncLoyaltyFromRetailCRM(user.id, phone).catch(() => null)

		return user
	}

	async syncLoyaltyFromRetailCRM(userId: string, phone?: string) {
		try {
			const retailUrl =
				process.env.RETAILCRM_URL || 'https://koreacosmos.retailcrm.ru'
			const apiKey = process.env.RETAILCRM_API_KEY
			if (!apiKey || !phone) return

			const params = new URLSearchParams({ limit: '20' })
			params.append('filter[phoneNumber]', phone.replace(/\D/g, ''))

			const res = await fetch(
				`${retailUrl}/api/v5/loyalty/accounts?${params}`,
				{
					headers: { 'X-API-KEY': apiKey }
				}
			)
			const data = await res.json()
			const account = data?.loyaltyAccounts?.[0]
			if (!account) return

			const retailOrdersSum = Math.round(account.ordersSum || 0)
			const retailLevelName: string | undefined = account.level?.name
			const retailDiscount: number = account.level?.privilegeSize ?? 0
			const retailLevelType: string | undefined = account.level?.type

			// Берём максимум между RetailCRM и локальными данными (мобильные заказы)
			const existing = await this.prisma.userLoyalty.findUnique({ where: { userId } })
			const localOrdersSum = existing?.totalAmountSpent || 0
			const ordersSum = Math.max(retailOrdersSum, localOrdersSum)

			// Синхронизируем уровень из RetailCRM в локальную БД (обновляем скидку если изменилась)
			let retailLevel = retailLevelName
				? await this.prisma.loyaltyLevel.findFirst({ where: { name: retailLevelName } })
				: null

			if (!retailLevel && retailLevelName) {
				const minAmount = retailLevelType === 'base' ? 0 : retailOrdersSum
				retailLevel = await this.prisma.loyaltyLevel.create({
					data: { name: retailLevelName, discount: retailDiscount, minAmount }
				})
			} else if (retailLevel && retailLevel.discount !== retailDiscount) {
				retailLevel = await this.prisma.loyaltyLevel.update({
					where: { id: retailLevel.id },
					data: { discount: retailDiscount }
				})
			}

			// Пересчитываем уровень по реальной сумме — берём наивысший подходящий из локальной БД
			const calculatedLevel = await this.prisma.loyaltyLevel.findFirst({
				where: { minAmount: { lte: ordersSum } },
				orderBy: { minAmount: 'desc' }
			})

			// Используем уровень с максимальной скидкой (защита от даунгрейда из RetailCRM)
			const bestLevel =
				calculatedLevel && (!retailLevel || calculatedLevel.discount >= retailLevel.discount)
					? calculatedLevel
					: retailLevel

			await this.prisma.userLoyalty.upsert({
				where: { userId },
				update: {
					totalAmountSpent: ordersSum,
					currentDiscount: bestLevel?.discount ?? retailDiscount,
					levelId: bestLevel?.id ?? null
				},
				create: {
					userId,
					totalAmountSpent: ordersSum,
					currentDiscount: bestLevel?.discount ?? retailDiscount,
					levelId: bestLevel?.id ?? null
				}
			})
		} catch {
			// silent fail
		}
	}

	async recalculateLoyaltyLevel(userId: string) {
		const userLoyalty = await this.prisma.userLoyalty.findUnique({ where: { userId } })
		if (!userLoyalty?.totalAmountSpent) return

		const newLevel = await this.prisma.loyaltyLevel.findFirst({
			where: { minAmount: { lte: userLoyalty.totalAmountSpent } },
			orderBy: { minAmount: 'desc' }
		})
		if (!newLevel || userLoyalty.levelId === newLevel.id) return

		await this.prisma.userLoyalty.update({
			where: { userId },
			data: { currentDiscount: newLevel.discount, levelId: newLevel.id }
		})
	}

	async syncProfileFromWordPress(userId: string, email: string) {
		const wcCustomer = await this.getWooCommerceCustomer(email)
		if (!wcCustomer) return

		const currentUser = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { phone: true }
		})

		const firstName = wcCustomer.first_name || ''
		const lastName = wcCustomer.last_name || ''
		const displayName =
			wcCustomer.display_name ||
			[firstName, lastName].filter(Boolean).join(' ') ||
			''

		await this.prisma.user.update({
			where: { id: userId },
			data: {
				displayName,
				name: firstName,
				surname: lastName,
				// Телефон из WC тянем только если в приложении он ещё не установлен
				...(!currentUser?.phone && { phone: wcCustomer.billing?.phone || '' })
			}
		})
	}

	async syncProfileToWordPress(email: string, dto: UserDto) {
		const wcCustomer = await this.getWooCommerceCustomer(email)
		if (!wcCustomer) return

		const updateData: any = {
			first_name: dto.name,
			last_name: dto.surname,
			display_name: dto.displayName,
			billing: { phone: dto.phone }
		}

		if (dto.email && dto.email !== email) {
			updateData.email = dto.email
		}

		if (dto.password) {
			updateData.password = dto.password
		}

		await axios
			.put(
				`${process.env.WP_URL}/wp-json/wc/v3/customers/${wcCustomer.id}`,
				updateData,
				{
					auth: {
						username: process.env.WC_CONSUMER_KEY,
						password: process.env.WC_CONSUMER_SECRET
					}
				}
			)
			.catch(() => null)
	}

	private async getWooCommerceCustomer(email: string) {
		const auth = {
			username: process.env.WC_CONSUMER_KEY,
			password: process.env.WC_CONSUMER_SECRET
		}
		const baseUrl = `${process.env.WP_URL}/wp-json/wc/v3/customers`

		try {
			const { data } = await axios.get(baseUrl, { params: { email }, auth })
			if (data[0]) return data[0]

			const { data: allRoles } = await axios.get(baseUrl, {
				params: { email, role: 'all' },
				auth
			})
			return allRoles[0] || null
		} catch {
			return null
		}
	}

	async update(id: string, dto: UserDto) {
		const isSameUser = await this.prisma.user.findUnique({
			where: { email: dto.email }
		})

		if (isSameUser && id !== isSameUser.id)
			throw new BadRequestException('Данный email уже занят')

		let data = dto
		if (dto.password) data = { ...dto, password: await hash(dto.password) }

		const updatedUser = await this.prisma.user.update({
			where: { id },
			data: { ...data },
			select: { ...returnUserObject }
		})

		return updatedUser
	}

	async delete(id: string) {
		const user = await this.getById(id)

		if (!user) throw new NotFoundException('Пользователь не найден')

		return this.prisma.user.delete({
			where: { id }
		})
	}

	async toggleFavorite(userId: string, productId: string) {
		const user = await this.getById(userId)
		if (!user) throw new NotFoundException('Пользователь не найден')

		const isExists = user.favoriteIds.includes(productId)

		await this.prisma.user.update({
			where: { id: user.id },
			data: {
				favoriteIds: isExists
					? { set: user.favoriteIds.filter(id => id !== productId) }
					: { push: productId }
			}
		})

		return {
			message: isExists
				? 'Товар удалён из избранного'
				: 'Товар добавлен в избранное'
		}
	}

	async clearFavorites(userId: string) {
		const user = await this.getById(userId)

		if (!user) throw new NotFoundException('Пользователь не найден')

		await this.prisma.user.update({
			where: { id: userId },
			data: {
				favoriteIds: { set: [] }
			}
		})

		return {
			message: 'Все товары удалены из избранного'
		}
	}
}
