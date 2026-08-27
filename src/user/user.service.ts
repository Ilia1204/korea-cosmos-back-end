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
			if (currentLevel && level.minAmount <= currentLevel.minAmount)
				return false
			return level.minAmount > totalAmountSpent
		})

		const ordersCount = await this.prisma.order.count({ where: { userId: id } })

		return {
			...user,
			nextLevel: nextLevel || null,
			isFirstAppOrder: ordersCount === 0
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

	async getAdminUsers(
		search?: string,
		page = 1,
		role?: string,
		hasOrders?: string
	) {
		const limit = 50
		const skip = (page - 1) * limit
		const where: Prisma.UserWhereInput = {}

		if (role === 'admin' || role === 'manager' || role === 'user')
			where.role = role as any

		if (hasOrders === 'yes') where.orders = { some: {} }
		else if (hasOrders === 'no') where.orders = { none: {} }

		if (search?.trim()) {
			const s = search.trim()
			where.OR = [
				{ email: { contains: s, mode: 'insensitive' } },
				{ name: { contains: s, mode: 'insensitive' } },
				{ surname: { contains: s, mode: 'insensitive' } },
				{ displayName: { contains: s, mode: 'insensitive' } },
				{ phone: { contains: s, mode: 'insensitive' } }
			]
		}

		const users = await this.prisma.user.findMany({
			where,
			select: {
				id: true,
				createdAt: true,
				email: true,
				role: true,
				name: true,
				surname: true,
				displayName: true,
				phone: true,
				userLoyalty: {
					select: {
						currentDiscount: true,
						totalAmountSpent: true,
						level: { select: { name: true, discount: true } }
					}
				},
				_count: { select: { orders: true } }
			},
			orderBy: { createdAt: 'desc' },
			skip,
			take: limit
		})

		return { users, page, hasMore: users.length === limit }
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
		const wcCustomer = await this.getWooCommerceCustomer(dto.email)

		const user = await this.prisma.user.create({
			data: {
				email: dto.email,
				password: await hash(dto.password),
				name: wcCustomer?.first_name || '',
				surname: wcCustomer?.last_name || '',
				phone: wcCustomer?.billing?.phone || '',
				source: wcCustomer ? 'site' : 'app'
			}
		})

		this.syncLoyaltyFromRetailCRM(
			user.id,
			wcCustomer?.billing?.phone,
			dto.email
		).catch(() => null)
		this.fillProfileFromRetailCrm(
			user.id,
			wcCustomer?.billing?.phone,
			dto.email
		).catch(() => null)

		return user
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
				phone: wcCustomer?.billing?.phone || '',
				source: 'site',
				emailVerified: true
			}
		})

		const phone = wcCustomer?.billing?.phone
		this.syncLoyaltyFromRetailCRM(user.id, phone, email).catch(() => null)
		this.fillProfileFromRetailCrm(user.id, phone, email).catch(() => null)

		return user
	}

	async createFromRetailCrm(
		email: string,
		password: string,
		phone: string,
		retailCustomer: any
	) {
		const user = await this.prisma.user.create({
			data: {
				email,
				password: await hash(password),
				name: retailCustomer?.firstName || '',
				surname: retailCustomer?.lastName || '',
				phone,
				source: 'retail',
				emailVerified: true,
				...(retailCustomer?.birthday && {
					dateOfBirth: new Date(retailCustomer.birthday)
				})
			}
		})

		this.syncLoyaltyFromRetailCRM(user.id, phone).catch(() => null)

		return user
	}

	// Ищем клиента в RetailCRM по телефону, а если его нет (частый случай для
	// сайтовых клиентов — WooCommerce не всегда хранит телефон) — по email
	private async findRetailCrmCustomer(
		phone?: string | null,
		email?: string | null
	): Promise<any | null> {
		const retailUrl =
			process.env.RETAILCRM_URL || 'https://koreacosmos.retailcrm.ru'
		const apiKey = process.env.RETAILCRM_API_KEY
		if (!apiKey) return null

		if (phone) {
			const params = new URLSearchParams({ limit: '1' })
			params.append('filter[phone]', phone.replace(/\D/g, ''))
			const res = await fetch(`${retailUrl}/api/v5/customers?${params}`, {
				headers: { 'X-API-KEY': apiKey }
			})
			const data = await res.json()
			const customer = data?.customers?.[0]
			if (customer) return customer
		}

		if (email) {
			const params = new URLSearchParams({ limit: '1' })
			params.append('filter[email]', email)
			const res = await fetch(`${retailUrl}/api/v5/customers?${params}`, {
				headers: { 'X-API-KEY': apiKey }
			})
			const data = await res.json()
			return data?.customers?.[0] || null
		}

		return null
	}

	async syncLoyaltyFromRetailCRM(
		userId: string,
		phone?: string | null,
		email?: string | null
	) {
		try {
			const apiKey = process.env.RETAILCRM_API_KEY
			if (!apiKey) return

			const customer = await this.findRetailCrmCustomer(phone, email)
			if (!customer) return

			const retailUrl =
				process.env.RETAILCRM_URL || 'https://koreacosmos.retailcrm.ru'
			const params = new URLSearchParams({ limit: '1' })
			params.append('filter[customerId]', String(customer.id))

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

			// Сумму считаем напрямую по доставленным заказам в приложении —
			// это источник истины. Из RetailCRM берём её только как стартовое
			// значение для тех, у кого ещё нет ни одного доставленного заказа
			// (например, покупали раньше на сайте/в CRM до установки приложения),
			// иначе сумма из CRM (может включать заказы любых статусов) при
			// каждом логине перезатирала бы корректную локальную сумму
			const existing = await this.prisma.userLoyalty.findUnique({
				where: { userId }
			})
			const deliveredOrders = await this.prisma.order.aggregate({
				where: { userId, status: 'delivered' },
				_sum: { totalPrice: true, deliveryPrice: true }
			})
			const localOrdersSum =
				(deliveredOrders._sum.totalPrice ?? 0) -
				(deliveredOrders._sum.deliveryPrice ?? 0)
			const ordersSum =
				localOrdersSum > 0
					? localOrdersSum
					: existing
					? existing.totalAmountSpent
					: retailOrdersSum

			// Синхронизируем уровень из RetailCRM в локальную БД (обновляем скидку если изменилась)
			let retailLevel = retailLevelName
				? await this.prisma.loyaltyLevel.findFirst({
						where: { name: retailLevelName }
				  })
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

			// Уровень пользователя всегда определяется реально посчитанной суммой,
			// а не «сырым» уровнем из CRM — иначе название статуса в CRM
			// (не всегда синхронное с суммой заказов в приложении) навязывало бы
			// скидку в обход фактических покупок
			const bestLevel = calculatedLevel ?? retailLevel

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

	async fillProfileFromRetailCrm(
		userId: string,
		phone?: string | null,
		email?: string | null
	) {
		try {
			const apiKey = process.env.RETAILCRM_API_KEY
			if (!apiKey) return

			const customer = await this.findRetailCrmCustomer(phone, email)
			if (!customer) return

			const currentUser = await this.prisma.user.findUnique({
				where: { id: userId },
				select: { name: true, surname: true, dateOfBirth: true }
			})

			const updateData: Prisma.UserUpdateInput = {}
			if (!currentUser?.name && !currentUser?.surname) {
				updateData.name = customer.firstName || ''
				updateData.surname = customer.lastName || ''
			}
			// RetailCRM — источник истины для даты рождения, дозаполняем только если пусто
			if (!currentUser?.dateOfBirth && customer.birthday) {
				updateData.dateOfBirth = new Date(customer.birthday)
			}
			if (Object.keys(updateData).length === 0) return

			await this.prisma.user.update({
				where: { id: userId },
				data: updateData
			})
		} catch {
			// silent fail
		}
	}

	// Дата рождения указывается пользователем впервые — пушим её в RetailCRM,
	// чтобы CRM оставалась источником истины при следующих логинах/синках
	private async pushDateOfBirthToRetailCrm(phone: string, dateOfBirth: string) {
		try {
			const retailUrl =
				process.env.RETAILCRM_URL || 'https://koreacosmos.retailcrm.ru'
			const apiKey = process.env.RETAILCRM_API_KEY
			if (!apiKey || !phone) return

			const params = new URLSearchParams({ limit: '1' })
			params.append('filter[phone]', phone.replace(/\D/g, ''))

			const res = await fetch(`${retailUrl}/api/v5/customers?${params}`, {
				headers: { 'X-API-KEY': apiKey }
			})
			const data = await res.json()
			const customer = data?.customers?.[0]
			if (!customer) return

			const birthday = new Date(dateOfBirth).toISOString().slice(0, 10)

			await fetch(`${retailUrl}/api/v5/customers/${customer.id}/edit`, {
				method: 'POST',
				headers: {
					'X-API-KEY': apiKey,
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams({
					by: 'id',
					customer: JSON.stringify({ birthday })
				}).toString()
			})
		} catch {
			// silent fail
		}
	}

	async recalculateLoyaltyLevel(userId: string) {
		const userLoyalty = await this.prisma.userLoyalty.findUnique({
			where: { userId }
		})
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

		const updateData: any = {}

		if (dto.name !== undefined) updateData.first_name = dto.name
		if (dto.surname !== undefined) updateData.last_name = dto.surname
		if (dto.displayName !== undefined) updateData.display_name = dto.displayName
		if (dto.phone !== undefined) updateData.billing = { phone: dto.phone }

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

	async update(id: string, dto: UserDto, isAdmin = false) {
		const isSameUser = await this.prisma.user.findUnique({
			where: { email: dto.email }
		})

		if (isSameUser && id !== isSameUser.id)
			throw new BadRequestException('Данный email уже занят')

		const currentUser = await this.prisma.user.findUnique({
			where: { id },
			select: { phone: true, name: true, surname: true, dateOfBirth: true }
		})

		if (dto.phone) {
			const phoneOwner = await this.prisma.user.findFirst({
				where: { phone: dto.phone, NOT: { id } }
			})
			if (phoneOwner)
				throw new BadRequestException(
					'Этот номер телефона уже используется другим аккаунтом'
				)
		}

		// Дату рождения можно установить только один раз — дальше она либо
		// пришла из RetailCRM, либо указана пользователем и уже уехала в CRM
		if (!isAdmin && dto.dateOfBirth !== undefined && currentUser?.dateOfBirth) {
			const currentIso = currentUser.dateOfBirth.toISOString().slice(0, 10)
			const nextIso = new Date(dto.dateOfBirth).toISOString().slice(0, 10)
			if (currentIso !== nextIso)
				throw new BadRequestException(
					'Дату рождения можно установить только один раз'
				)
		}

		let data = dto
		if (dto.password) data = { ...dto, password: await hash(dto.password) }

		const currentRole = await this.prisma.user.findUnique({
			where: { id },
			select: { role: true }
		})

		const updatedUser = await this.prisma.user.update({
			where: { id },
			data: { ...data },
			select: { ...returnUserObject }
		})

		if (
			dto.role &&
			dto.role === 'user' &&
			currentRole &&
			currentRole.role !== 'user'
		) {
			await this.prisma.groupChatParticipant.deleteMany({
				where: { userId: id }
			})
		}

		// Если телефон только что добавили/сменили — подтягиваем лояльность и недостающие поля профиля из розницы
		if (dto.phone && dto.phone !== currentUser?.phone) {
			this.syncLoyaltyFromRetailCRM(id, dto.phone, dto.email).catch(() => null)
			this.fillProfileFromRetailCrm(id, dto.phone, dto.email).catch(() => null)
		}

		// Дата рождения указана пользователем впервые — RetailCRM должен остаться источником истины
		if (dto.dateOfBirth && !currentUser?.dateOfBirth) {
			const phone = dto.phone || currentUser?.phone
			if (phone)
				this.pushDateOfBirthToRetailCrm(phone, dto.dateOfBirth).catch(
					() => null
				)
		}

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

		return { message: 'Все товары удалены из избранного' }
	}
}
