import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { hash } from 'argon2'
import { AuthDto } from 'src/auth/dto/auth.dto'
import { PrismaService } from 'src/prisma.service'
import { returnUserObject } from './return-user.object'
import { UserDto } from './user.dto'

@Injectable()
export class UserService {
	constructor(private prisma: PrismaService) {}

	getById(id: string, selectObject: Prisma.UserSelect = {}) {
		return this.prisma.user.findUnique({
			where: {
				id
			},
			select: {
				...returnUserObject,
				favorites: {
					select: {
						id: true,
						name: true,
						price: true,
						newPrice: true,
						images: true,
						slug: true,
						discount: true,
						stock: true,
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
	}

	getByEmail(email: string) {
		return this.prisma.user.findUnique({
			where: {
				email
			}
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
			where: {
				email: dto.email
			}
		})

		if (isSameUser && id !== isSameUser.id)
			throw new BadRequestException('Данный email уже занят')

		let data = dto

		if (dto.password) {
			data = { ...dto, password: await hash(dto.password) }
		}

		return this.prisma.user.update({
			where: {
				id
			},
			data,
			select: {
				...returnUserObject
			}
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
}
