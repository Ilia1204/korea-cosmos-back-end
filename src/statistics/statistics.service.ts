import { Injectable } from '@nestjs/common'
import * as dayjs from 'dayjs'
import { PrismaService } from 'src/prisma.service'
require('dayjs/locale/ru')

dayjs.locale('ru')

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

	async getNumbers() {
		const activeUsersCount = await this.prisma.user.count({
			where: {
				updatedAt: {
					gte: new Date(new Date().setDate(new Date().getDate() - 30))
				}
			}
		})

		const newUsersLastMonth = await this.prisma.user.count({
			where: {
				createdAt: {
					gte: new Date(new Date().setDate(new Date().getDate() - 30))
				}
			}
		})

		return [
			{
				name: 'Кол-во активных пользователей за месяц',
				value: activeUsersCount
			},
			{
				name: 'Количество новых пользователей за месяц',
				value: newUsersLastMonth
			}
		]
	}

	async getUserRegistrationsByMonth() {
		const currentMonth = new Date().getMonth()
		const currentYear = new Date().getFullYear()

		const startDate = new Date(currentYear - 1, currentMonth, 1)
		const endDate = new Date(currentYear, currentMonth + 1, 0)

		const allMonths = this.generateMonths(startDate, endDate)

		const registrations = await this.prisma.user.groupBy({
			by: ['createdAt'],
			_count: true,
			orderBy: {
				createdAt: 'asc'
			},
			where: {
				createdAt: {
					gte: startDate,
					lte: endDate
				}
			}
		})

		const registrationMap = new Map<string, number>()

		for (const reg of registrations) {
			const month = reg.createdAt.getMonth() + 1
			const year = reg.createdAt.getFullYear()
			const key = `${year}-${month}`

			if (registrationMap.has(key)) {
				registrationMap.set(key, registrationMap.get(key) + reg._count)
			} else {
				registrationMap.set(key, reg._count)
			}
		}

		return allMonths.map(({ month, year }) => {
			const key = `${year}-${month}`
			const monthName = dayjs(new Date(year, month - 1)).format('MMMM')
			return {
				month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
				year,
				count: registrationMap.get(key) || 0
			}
		})
	}

	private generateMonths(
		start: Date,
		end: Date
	): { month: number; year: number }[] {
		const current = new Date(start)
		const endMonth = new Date(end)
		const months = []

		while (current < endMonth) {
			months.push({
				month: current.getMonth() + 1,
				year: current.getFullYear()
			})
			current.setMonth(current.getMonth() + 1)
		}

		return months
	}
}
