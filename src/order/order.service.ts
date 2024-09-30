import { Injectable, NotFoundException } from '@nestjs/common'
import { EnumOrderStatus } from '@prisma/client'
import { PrismaService } from 'src/prisma.service'
import { returnProductObject } from 'src/product/return-product.object'
import { returnUserObject } from './../user/return-user.object'
import { OrderDto, UpdateOrderDto } from './dto/order.dto'
import { PaymentStatusDto } from './dto/payment-status.dto'

import { ICapturePayment, YooCheckout } from '@a2seven/yoo-checkout'
import { NotificationsService } from 'src/notifications/notifications.service'
import { ProductService } from 'src/product/product.service'
import {
	getOrderStatusIcons,
	getOrderStatusTranslation
} from 'src/utils/translate-status'

const checkout = new YooCheckout({
	shopId: process.env['YOOKASSA_SHOP_ID'],
	secretKey: process.env['YOOKASSA_SECRET_KEY']
})

@Injectable()
export class OrderService {
	constructor(
		private prisma: PrismaService,
		private notificationService: NotificationsService,
		private productService: ProductService
	) {}

	async getById(id: string) {
		return this.prisma.order.findUnique({
			where: { id },
			include: {
				user: { select: { ...returnUserObject } },
				address: true,
				items: {
					include: {
						product: {
							select: {
								...returnProductObject,
								composition: false,
								description: false,
								reviews: false,
								labelProduct: { select: { name: true } },
								categories: {
									select: {
										name: true,
										slug: true,
										section: {
											select: {
												name: true,
												slug: true
											}
										}
									}
								}
							}
						}
					}
				}
			}
		})
	}

	async createPayment(dto: OrderDto, userId: string) {
		const orderItems = await Promise.all(
			dto.items.map(async item => {
				const product = await this.prisma.product.findUnique({
					where: { id: item.productId },
					include: { categories: true }
				})

				return {
					quantity: item.quantity,
					price: item.price,
					product
				}
			})
		)

		const userLoyalty = await this.prisma.userLoyalty.findUnique({
			where: { userId }
		})

		const discount = userLoyalty ? userLoyalty.currentDiscount : 0

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { dateOfBirth: true }
		})

		const birthdayDiscount = this.calculateBirthdayDiscount(user.dateOfBirth)
		const applicableDiscount = this.getApplicableDiscount(
			discount,
			birthdayDiscount
		)

		const totalPriceWithDiscount = this.calculateTotalPriceWithDiscount(
			orderItems,
			applicableDiscount
		)

		const totalPriceWithDelivery =
			totalPriceWithDiscount + (dto.deliveryPrice || 0)

		const order = await this.prisma.order.create({
			include: { user: true },
			data: {
				status: dto.status,
				deliveryMethod: dto.deliveryMethod,
				deliveryPrice: dto.deliveryPrice,
				coupon: dto.coupon,
				comment: dto.comment,
				recipientDetails: dto.recipientDetails,
				recipientName: dto.recipientName,
				recipientSurname: dto.recipientSurname,
				recipientPhone: dto.recipientPhone,
				recipientEmail: dto.recipientEmail,
				discountApplied: applicableDiscount,
				items: {
					create: dto.items.map(item => ({
						quantity: item.quantity,
						price: item.price,
						product: {
							connect: { id: item.productId }
						}
					}))
				},
				...(dto.addressId && {
					address: {
						connect: {
							id: dto.addressId
						}
					}
				}),
				totalPrice: totalPriceWithDelivery,
				user: {
					connect: {
						id: userId
					}
				}
			}
		})

		setTimeout(async () => {
			await this.notificationService.sendPushNotificationToAdmins(
				'🛍️ Новый заказ',
				`Пришёл новый заказ с id: #${order.id.slice(0, 6).toUpperCase()}`,
				{ orderId: order.id, isRead: true }
			)
		}, 2000)

		const payment = await checkout.createPayment({
			amount: {
				value: totalPriceWithDelivery.toFixed(2),
				currency: 'RUB'
			},
			payment_method_data: {
				type: 'bank_card'
			},
			confirmation: {
				type: 'redirect',
				return_url: 'Thanks'
			},
			description: `Номер заказа: #${order.id}`
		})

		return payment
	}

	calculateBirthdayDiscount(dateOfBirth: Date) {
		const today = new Date()
		const birthDate = new Date(dateOfBirth)
		const daysToBirthday = this.calculateDaysBetween(today, birthDate)

		if (daysToBirthday <= 7 && daysToBirthday >= -7) return 20

		return 0
	}

	calculateDaysBetween(date1: Date, date2: Date): number {
		const timeDiff = date2.getTime() - date1.getTime()
		return Math.ceil(timeDiff / (1000 * 3600 * 24))
	}

	getApplicableDiscount(loyaltyDiscount: number, birthdayDiscount: number) {
		if (birthdayDiscount > 0) return birthdayDiscount
		return loyaltyDiscount
	}

	async getAll() {
		return this.prisma.order.findMany({
			orderBy: {
				createdAt: 'desc'
			},
			include: {
				user: {
					select: {
						...returnUserObject
					}
				},
				address: true,
				items: {
					include: {
						product: {
							select: {
								...returnProductObject,
								composition: false,
								description: false,
								reviews: false,
								labelProduct: {
									select: {
										name: true
									}
								},
								categories: {
									select: {
										name: true,
										slug: true,
										section: {
											select: {
												name: true,
												slug: true
											}
										}
									}
								}
							}
						}
					}
				}
			}
		})
	}

	async payOrder(orderId: string) {
		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: {
				totalPrice: true,
				userId: true,
				status: true,
				items: true,
				deliveryPrice: true
			}
		})

		if (!order) throw new NotFoundException('Заказ не найден')

		const payment = await checkout.createPayment({
			amount: {
				value: order.totalPrice.toFixed(2),
				currency: 'RUB'
			},
			payment_method_data: {
				type: 'bank_card'
			},
			confirmation: {
				type: 'redirect',
				return_url: `Thanks`
			},
			description: `Номер заказа: #${orderId}`
		})

		if (payment.status === 'succeeded') {
			await this.notificationService.saveNotification(
				order.userId,
				getOrderStatusIcons(order.status),
				`Заказ #${orderId
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(order.status)}`,
				{ orderUserId: orderId, status: order.status }
			)

			for (const item of order.items) {
				await this.productService.updateOrdersCount(item.productId)
			}

			if (order) {
				if (order.userId) {
					await this.prisma.userLoyalty.upsert({
						where: { userId: order.userId },
						update: {
							totalAmountSpent: {
								increment: order.totalPrice - order.deliveryPrice
							}
						},
						create: {
							userId: order.userId,
							totalAmountSpent: order.totalPrice - order.deliveryPrice,
							currentDiscount: 0
						}
					})

					await this.updateUserLoyaltyLevel(order.userId)
				}
			}

			setTimeout(async () => {
				await this.notificationService.sendPushNotificationToUser(
					order.userId,
					'💳 Заказ оформлен и оплачен',
					`Заказ #${orderId.slice(0, 6).toUpperCase()} был успешно оплачен.`,
					{ orderUserId: orderId, status: order.status, isRead: true }
				)
			}, 2000)
		}

		return payment
	}

	calculateTotalPriceWithDiscount(orderItems, applicableDiscount) {
		const total = orderItems.reduce((acc, item) => {
			const isDiscountedCategory = item.product.categories.some(
				category =>
					category.name === 'Скидки' && category.section === 'Акции и скидки'
			)

			if (!isDiscountedCategory) {
				const discountedPrice =
					item.price - item.price * (applicableDiscount / 100)
				return acc + discountedPrice * item.quantity
			}

			return acc
		}, 0)

		return total
	}

	async getByUserId(userId: string) {
		return this.prisma.order.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			include: {
				user: {
					select: {
						...returnUserObject
					}
				},
				address: true,
				items: {
					include: {
						product: {
							select: {
								...returnProductObject,
								composition: false,
								description: false,
								reviews: false,
								labelProduct: {
									select: {
										name: true
									}
								},
								categories: {
									select: {
										name: true,
										slug: true,
										section: {
											select: {
												name: true,
												slug: true
											}
										}
									}
								}
							}
						}
					}
				}
			}
		})
	}

	async updateUserLoyaltyLevel(userId: string) {
		const userLoyalty = await this.prisma.userLoyalty.findUnique({
			where: { userId },
			include: { level: true }
		})

		if (!userLoyalty) return
		const { totalAmountSpent } = userLoyalty

		const newLevel = await this.prisma.loyaltyLevel.findFirst({
			where: {
				minAmount: { lte: totalAmountSpent }
			},
			orderBy: { minAmount: 'desc' }
		})

		if (newLevel && userLoyalty.levelId !== newLevel.id) {
			await this.prisma.userLoyalty.update({
				where: { userId },
				data: {
					currentDiscount: newLevel.discount,
					levelId: newLevel.id
				}
			})

			setTimeout(async () => {
				await this.notificationService.saveNotification(
					userId,
					`🌟 Присвоение статуса «${newLevel.name}»`,
					`Поздравляем! Теперь ваша персональная скидка составляет ${newLevel.discount} %.`,
					{ discount: newLevel }
				)

				await this.notificationService.sendPushNotificationToUser(
					userId,
					`🌟 Присвоение статуса «${newLevel.name}»`,
					`Поздравляем! Теперь ваша персональная скидка составляет ${newLevel.discount} %.`,
					{ discount: newLevel }
				)
			}, 10000)
		}
	}

	async updateStatus(dto: PaymentStatusDto) {
		if (dto.event === 'payment.waiting_for_capture') {
			const capturePayment: ICapturePayment = {
				amount: {
					value: dto.object.amount.value,
					currency: dto.object.amount.currency
				}
			}

			return checkout.capturePayment(dto.object.id, capturePayment)
		}

		if (dto.event === 'payment.succeeded') {
			const orderId = dto.object.description.split('#')[1].split('.')[0].trim()
			const order = await this.prisma.order.findUnique({
				where: { id: orderId },
				include: { items: { include: { product: true } }, user: true }
			})

			if (!order) throw new NotFoundException('Заказ не найден')

			for (const item of order.items) {
				await this.productService.updateOrdersCount(item.productId)
			}

			const orderUpdated = await this.prisma.order.update({
				where: { id: orderId },
				data: {
					status: EnumOrderStatus.payed
				}
			})

			if (orderUpdated) {
				if (orderUpdated.userId) {
					await this.prisma.userLoyalty.upsert({
						where: { userId: orderUpdated.userId },
						update: {
							totalAmountSpent: {
								increment: orderUpdated.totalPrice - orderUpdated.deliveryPrice
							}
						},
						create: {
							userId: orderUpdated.userId,
							totalAmountSpent:
								orderUpdated.totalPrice - orderUpdated.deliveryPrice,
							currentDiscount: 0
						}
					})

					await this.updateUserLoyaltyLevel(orderUpdated.userId)
				}
			}

			setTimeout(async () => {
				const notification = await this.notificationService.saveNotification(
					orderUpdated.userId,
					getOrderStatusIcons(orderUpdated.status),
					`Заказ #${orderUpdated.id
						.slice(0, 6)
						.toUpperCase()} ${getOrderStatusTranslation(orderUpdated.status)}`,
					{ orderUserId: orderId, status: orderUpdated.status }
				)

				await this.notificationService.sendPushNotificationToUser(
					orderUpdated.userId,
					getOrderStatusIcons(orderUpdated.status),
					`Заказ #${orderUpdated.id
						.slice(0, 6)
						.toUpperCase()} ${getOrderStatusTranslation(orderUpdated.status)}`,
					{
						orderUserId: orderId,
						status: orderUpdated.status,
						notification: notification.id
					}
				)
			}, 2000)

			return true
		}
		return true
	}

	async update(id: string, dto: UpdateOrderDto) {
		const order = await this.getById(id)
		if (!order) throw new NotFoundException('Заказ не найден')

		const orderUpdated = await this.prisma.order.update({
			where: { id },
			include: { user: true },
			data: { status: dto.status }
		})

		setTimeout(async () => {
			const notification = await this.notificationService.saveNotification(
				orderUpdated.user.id,
				getOrderStatusIcons(dto.status),
				`Заказ #${orderUpdated.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(dto.status)}`,
				{ orderUserId: orderUpdated.id, status: orderUpdated.status }
			)

			await this.notificationService.sendPushNotificationToUser(
				orderUpdated.userId,
				`${getOrderStatusIcons(dto.status)}`,
				`Заказ #${orderUpdated.id
					.slice(0, 6)
					.toUpperCase()} ${getOrderStatusTranslation(dto.status)}`,
				{
					orderUserId: orderUpdated.id,
					status: orderUpdated.status,
					notification: notification.id
				}
			)
		}, 2000)
	}

	async delete(id: string) {
		const order = await this.getById(id)
		if (!order) throw new NotFoundException('Заказ не найден')

		return this.prisma.order.delete({ where: { id } })
	}
}
