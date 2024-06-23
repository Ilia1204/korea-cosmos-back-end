import { Injectable } from '@nestjs/common'
import { EnumOrderStatus } from '@prisma/client'
import { PrismaService } from 'src/prisma.service'
import { returnProductObject } from 'src/product/return-product.object'
import { OrderDto } from './order.dto'
import { PaymentStatusDto } from './payment-status.dto'

@Injectable()
export class OrderService {
	constructor(private prisma: PrismaService) {}

	async getAll() {
		return this.prisma.order.findMany({
			orderBy: {
				createdAt: 'desc'
			},
			include: {
				items: {
					include: {
						product: {
							select: returnProductObject
						}
					}
				}
			}
		})
	}

	async getByUserId(userId: string) {
		return this.prisma.order.findMany({
			where: {
				userId
			},
			orderBy: {
				createdAt: 'desc'
			},
			include: {
				items: {
					include: {
						product: {
							select: returnProductObject
						}
					}
				}
			}
		})
	}

	async placeOrder(dto: OrderDto, userId: string) {
		const totalPrice = dto.items.reduce((acc, item) => {
			return acc + item.price * item.quantity
		}, 0)

		return await this.prisma.order.create({
			data: {
				status: dto.status,
				items: {
					create: dto.items
				},
				totalPrice,
				user: {
					connect: {
						id: userId
					}
				}
			}
		})
	}

	async updateStatus(dto: PaymentStatusDto) {
		// if (dto.event === 'payment.waiting_for_capture') {
		// 	const payment = await yooKassa.capturePayment(dto.object.id)
		// 	return payment
		// }

		if (dto.event === 'payment.succeeded') {
			const orderId = dto.object.description.split('#')[1]

			await this.prisma.order.update({
				where: {
					id: orderId
				},
				data: {
					status: EnumOrderStatus.payed
				}
			})

			return true
		}

		return true
	}
}
