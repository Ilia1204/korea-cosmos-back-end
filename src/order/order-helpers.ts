import { OrderDto } from './dto/order.dto'

export function calculateTotal(
	items: OrderDto['items'],
	discount: number,
	couponData: any,
	deliveryPrice = 0
): number {
	const subtotal = items.reduce((acc, item) => {
		const original = item.originalPrice || item.price
		const saleDiscount =
			original > item.price ? ((original - item.price) / original) * 100 : 0
		const effective = Math.max(discount, saleDiscount)
		return acc + original * (1 - effective / 100) * item.quantity
	}, 0)

	let afterCoupon = subtotal
	if (couponData?.valid) {
		afterCoupon =
			couponData.discountType === 'percent'
				? subtotal * (1 - couponData.amount / 100)
				: Math.max(0, subtotal - couponData.amount)
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
		totalPrice,
		items: {
			create: dto.items.map(item => ({
				quantity: item.quantity,
				price: item.price,
				productId: item.productId,
				productName: item.productName || null,
				productImage: item.productImage || null
			}))
		},
		...(dto.addressId && { address: { connect: { id: dto.addressId } } }),
		user: { connect: { id: userId } }
	}
}
