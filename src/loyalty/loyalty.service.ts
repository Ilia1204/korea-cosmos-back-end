import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'

@Injectable()
export class LoyaltyService {
	constructor(private prisma: PrismaService) {}

	async calculateDiscount(userId: string) {
		const orders = await this.prisma.order.findMany({
			where: { userId, status: 'payed' },
			orderBy: { createdAt: 'asc' }
		})

		const relevantOrders = orders.slice(1)

		let totalAmount = 0
		for (const order of relevantOrders) {
			const orderItems = await this.prisma.orderItem.findMany({
				where: {
					orderId: order.id,
					product: {
						categories: {
							none: { slug: 'sertifikaty' }
						}
					}
				},
				include: { product: true }
			})

			for (const item of orderItems) {
				totalAmount += item.price * item.quantity
			}
		}

		let discount = 0

		if (totalAmount >= 35000) {
			discount = 15
		} else if (totalAmount >= 25000) {
			discount = 13
		} else if (totalAmount >= 15000) {
			discount = 10
		} else if (totalAmount >= 10000) {
			discount = 7
		} else if (totalAmount >= 5000) {
			discount = 5
		} else if (totalAmount >= 3000) {
			discount = 3
		} else if (totalAmount >= 1) {
			discount = 1
		}

		return discount
	}
}
