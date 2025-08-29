import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'

export interface ICartItemInput {
	productId: string
	quantity: number
	price: number
}

@Injectable()
export class CartService {
	constructor(private prisma: PrismaService) {}

	async getCart(userId: string) {
		return this.prisma.cartItem.findMany({
			where: { userId },
			orderBy: { createdAt: 'asc' }
		})
	}

	async syncCart(userId: string, items: ICartItemInput[]) {
		// Удаляем все текущие элементы и заменяем новыми
		await this.prisma.cartItem.deleteMany({ where: { userId } })

		if (items.length === 0) return []

		await this.prisma.cartItem.createMany({
			data: items.map(item => ({
				userId,
				productId: item.productId,
				quantity: item.quantity,
				price: item.price
			}))
		})

		return this.getCart(userId)
	}

	async clearCart(userId: string) {
		await this.prisma.cartItem.deleteMany({ where: { userId } })
		return []
	}
}
