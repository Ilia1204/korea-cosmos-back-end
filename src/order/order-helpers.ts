import { IReceiptItem } from 'src/robokassa/robokassa.interface'
import { OrderDto } from './dto/order.dto'

export function calculateTotal(
	items: OrderDto['items'],
	discount: number,
	couponData: any,
	deliveryPrice = 0
): number {
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

export function normalizeReceiptPhone(
	phone?: string | null
): string | undefined {
	if (!phone) return undefined
	const digits = phone.replace(/\D/g, '')
	if (digits.length === 11 && digits.startsWith('8'))
		return `7${digits.slice(1)}`
	if (digits.length === 11 && digits.startsWith('7')) return digits
	if (digits.length === 10) return `7${digits}`
	return undefined
}

export function buildReceiptItems(
	items: { name: string; quantity: number; price: number }[],
	deliveryPrice: number,
	totalPrice: number
): IReceiptItem[] {
	const rawSubtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
	const targetGoodsTotal = Math.max(0, totalPrice - deliveryPrice)
	const scale = rawSubtotal > 0 ? targetGoodsTotal / rawSubtotal : 1

	const receiptItems: IReceiptItem[] = items.map(item => ({
		name: item.name,
		quantity: item.quantity,
		sum: Math.round(item.price * item.quantity * scale * 100) / 100,
		payment_method: 'full_payment',
		payment_object: 'commodity',
		tax: 'none'
	}))

	if (deliveryPrice > 0) {
		receiptItems.push({
			name: 'Доставка',
			quantity: 1,
			sum: deliveryPrice,
			payment_method: 'full_payment',
			payment_object: 'service',
			tax: 'none'
		})
	}

	const currentSum = receiptItems.reduce((s, i) => s + i.sum, 0)
	const diff = Math.round((totalPrice - currentSum) * 100) / 100
	if (diff !== 0 && receiptItems.length > 0) {
		const last = receiptItems[receiptItems.length - 1]
		last.sum = Math.round((last.sum + diff) * 100) / 100
	}

	return receiptItems
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
		cdekPickupCode: dto.cdekPickupCode || null,
		cdekPickupAddress: dto.cdekPickupAddress || '',
		totalPrice,
		items: {
			create: dto.items.map(item => ({
				quantity: item.quantity,
				price: item.price,
				productId: item.productId,
				variationId: item.variationId ?? null,
				variationLabel: item.variationLabel || null,
				productName: item.productName || null,
				productImage: item.productImage || null
			}))
		},
		...(dto.addressId && { address: { connect: { id: dto.addressId } } }),
		user: { connect: { id: userId } }
	}
}
