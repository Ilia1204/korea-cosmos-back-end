export function calculateBirthdayDiscount(dateOfBirth: Date): number {
	const days = calculateDaysBetween(new Date(), new Date(dateOfBirth))
	return days <= 7 && days >= -7 ? 20 : 0
}

export function calculateDaysBetween(date1: Date, date2: Date): number {
	return Math.ceil((date2.getTime() - date1.getTime()) / (1000 * 3600 * 24))
}

export function getApplicableDiscount(
	loyaltyDiscount: number,
	birthdayDiscount: number
): number {
	return birthdayDiscount > 0 ? birthdayDiscount : loyaltyDiscount
}
