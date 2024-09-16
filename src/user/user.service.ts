import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { hash } from 'argon2'
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
			where: {
				id
			},
			select: {
				...returnUserObject,
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
				favorites: {
					select: {
						id: true,
						name: true,
						price: true,
						newPrice: true,
						images: true,
						slug: true,
						discount: true,
						inStock: true,
						reviews: {
							where: {
								isPublic: true
							},
							select: {
								user: {
									select: {
										name: true
									}
								}
							}
						},
						labelProduct: {
							select: {
								name: true
							}
						},
						rating: true
					}
				},
				...selectObject
			}
		})

		const totalAmountSpent = user?.userLoyalty?.totalAmountSpent || 0

		const loyaltyLevels = await this.prisma.loyaltyLevel.findMany({
			orderBy: { minAmount: 'asc' }
		})

		const nextLevel = loyaltyLevels.find(
			level => totalAmountSpent < level.minAmount
		)

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

		const isExists = user.favorites.some(product => product.id === productId)

		await this.prisma.user.update({
			where: {
				id: user.id
			},
			data: {
				favorites: {
					[isExists ? 'disconnect' : 'connect']: {
						id: productId
					}
				}
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
				favorites: {
					disconnect: user.favorites.map(product => ({ id: product.id }))
				}
			}
		})

		return {
			message: 'Все товары удалены из избранного'
		}
	}
}
