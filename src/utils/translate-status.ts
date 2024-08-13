const statusTranslations = {
	pending: 'ожидает оплаты для подтверждения',
	payed: 'оформлен и оплачен',
	shipped: 'отправлен по указанному адресу',
	delivered: 'доставлен по указанному адресу',
	cancelled: 'отменён, так как не был вовремя оплачен'
}

const statusIcons = {
	pending: '⌛ Ожидание оплаты',
	payed: '💳 Оплата заказа',
	shipped: '🚚 Отправлен заказ',
	delivered: '✅ Доставлен заказ',
	cancelled: '⛔ Отмена заказа'
}

export const getOrderStatusIcons = (status: string): string => {
	return statusIcons[status] || '❓ Статус заказа не известен'
}

export const getOrderStatusTranslation = (status: string): string => {
	return statusTranslations[status] || 'Неизвестный статус'
}
