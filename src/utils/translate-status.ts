const statusTranslations = {
	pending:
		'ожидает оплаты для подтверждения. Оплатите заказ в течении 2 часов.',
	payed: 'оформлен и оплачен. Благодарим за покупку!',
	shipped:
		'отправлен по указанному адресу. Мы сообщим, когда заказ будет доставлен.',
	delivered: 'доставлен по указанному адресу. Спасибо, что выбрали нас!',
	cancelled: 'отменён. Узнайте причину подробнее.',
	ready_to_receive:
		'готов к получению. Заберите его по адресу ул. Гончарова, 34, ТЦ Садко, 1 этаж.'
}

const statusIcons = {
	pending: '⌛ Ожидание оплаты',
	payed: '💳 Оплата заказа',
	shipped: '🚚 Отправлен заказ',
	delivered: '✅ Доставлен заказ',
	cancelled: '⛔ Отмена заказа',
	ready_to_receive: '🚀 Заказ готов к получению'
}

export const getOrderStatusIcons = (status: string): string => {
	return statusIcons[status] || '❓ Статус заказа не известен'
}

export const getOrderStatusTranslation = (status: string): string => {
	return statusTranslations[status] || 'Неизвестный статус'
}
