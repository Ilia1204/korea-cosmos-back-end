const BIRTHDAY_WINDOW_DAYS = 3

export function calculateBirthdayDiscount(dateOfBirth: Date): number {
	return Math.abs(getDaysUntilBirthday(dateOfBirth)) <= BIRTHDAY_WINDOW_DAYS
		? 20
		: 0
}

export function getDaysUntilBirthday(
	dateOfBirth: Date,
	from: Date = new Date()
): number {
	const birth = new Date(dateOfBirth)
	const month = birth.getUTCMonth()
	const day = birth.getUTCDate()

	const todayUTC = Date.UTC(
		from.getUTCFullYear(),
		from.getUTCMonth(),
		from.getUTCDate()
	)
	const year = from.getUTCFullYear()

	const occurrences = [year - 1, year, year + 1].map(y =>
		Date.UTC(y, month, day)
	)
	const closest = occurrences.reduce((best, t) =>
		Math.abs(t - todayUTC) < Math.abs(best - todayUTC) ? t : best
	)

	return Math.round((closest - todayUTC) / (1000 * 3600 * 24))
}

export function getApplicableDiscount(
	loyaltyDiscount: number,
	birthdayDiscount: number,
	welcomeDiscount = 0
): number {
	return Math.max(loyaltyDiscount, birthdayDiscount, welcomeDiscount)
}
