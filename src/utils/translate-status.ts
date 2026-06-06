const statusTranslations = {
	pending:
		'ожидает оплаты. Оплатите заказ в течение 2 часов, иначе он будет отменён.',
	payed: 'успешно оплачен. Спасибо за покупку — скоро начнём собирать!',
	shipped:
		'передан в доставку. Ожидайте — сообщим, когда он прибудет.',
	delivered: 'доставлен. Спасибо, что выбрали нас — будем рады видеть снова!',
	cancelled: 'отменён. Если у вас есть вопросы — напишите нам в поддержку.',
	ready_to_receive:
		'готов к получению. Заберите его по адресу: ул. Гончарова, 34, ТЦ Садко, 1 этаж.'
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
