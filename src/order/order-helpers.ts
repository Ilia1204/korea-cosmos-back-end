import { OrderDto } from './dto/order.dto'

export function calculateTotal(
	items: OrderDto['items'],
	discount: number,
	couponData: any,
	deliveryPrice = 0
): number {
	// Если купон процентный — берём наибольшее из автоскидки и купона (не суммируем)
	const percentCoupon =
		couponData?.valid && couponData.discountType === 'percent'
			? couponData.amount
			: 0
	const effectiveDiscount = Math.max(discount, percentCoupon)

	const subtotal = items.reduce((acc, item) => {
		const original = item.originalPrice || item.price
		const saleDiscount =
			original > item.price ? ((original - item.price) / original) * 100 : 0
		const effective = Math.max(effectiveDiscount, saleDiscount)
		return acc + original * (1 - effective / 100) * item.quantity
	}, 0)

	// Фиксированный купон применяется поверх (он не конкурирует с процентной скидкой)
	let afterCoupon = subtotal
	if (couponData?.valid && couponData.discountType !== 'percent') {
		afterCoupon = Math.max(0, subtotal - couponData.amount)
	}
	return afterCoupon + deliveryPrice
}

export function buildOrderData(
	dto: OrderDto,
	userId: string,
	discount: number,
	invoiceId: number,
	totalPrice: number
) {
	return {
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
		discountApplied: discount,
		invoiceId,
		podeli: dto.podeli ?? false,
		totalPrice,
		items: {
			create: dto.items.map(item => ({
				quantity: item.quantity,
				price: item.price,
				productId: item.productId,
				variationId: item.variationId ?? null,
				productName: item.productName || null,
				productImage: item.productImage || null
			}))
		},
		...(dto.addressId && { address: { connect: { id: dto.addressId } } }),
		user: { connect: { id: userId } }
	}
}
