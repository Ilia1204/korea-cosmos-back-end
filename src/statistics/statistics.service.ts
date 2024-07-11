import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'

@Injectable()
export class StatisticsService {
	constructor(private prisma: PrismaService) {}

	async getMain() {
		const ordersCount = await this.prisma.order.count()
		const reviewsCount = await this.prisma.review.count()
		const usersCount = await this.prisma.user.count()

		const totalAmount = await this.prisma.order.aggregate({
			_sum: {
				totalPrice: true
			}
		})

		return [
			{
				name: 'Заказы',
				value: ordersCount
			},
			{
				name: 'Отзывы',
				value: reviewsCount
			},
			{
				name: 'Пользователи',
				value: usersCount
			},
			{
				name: 'Общая сумма заказов',
				value: totalAmount._sum.totalPrice || 0
			}
		]
	}
}
