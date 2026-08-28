export const getCorrectFormWord = (num: number, forms: string[]) => {
	const lastDigit = num % 10
	const lastTwoDigits = num % 100

	if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return forms[2]

	switch (lastDigit) {
		case 1:
			return forms[0]
		case 2:
		case 3:
		case 4:
			return forms[1]
		default:
			return forms[2]
	}
}

export const productForms = ['товар', 'товара', 'товаров']
