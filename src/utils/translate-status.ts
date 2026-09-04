const statusTranslations: Record<string, string> = {
	pending:
		'ожидает оплаты. Оплатите заказ в течение 24 часов, иначе он будет отменён.',
	payed: 'успешно оплачен. Спасибо за покупку — скоро начнём собирать!',
	shipped: 'передан в доставку. Ожидайте — сообщим, когда он прибудет.',
	delivered: 'доставлен. Спасибо, что выбрали нас — будем рады видеть снова!',
	cancelled: 'отменён. Если у вас есть вопросы — напишите нам в поддержку.',
	ready_to_receive:
		'готов к получению. Заберите его по адресу: ул. Гончарова, 34, ТЦ Садко, 1 этаж.'
}

const statusTranslationsPickup: Record<string, string> = {
	...statusTranslations,
	delivered: 'получен. Спасибо, что выбрали нас — будем рады видеть снова!',
	ready_to_receive:
		'готов к выдаче. Заберите его по адресу: ул. Гончарова, 34, ТЦ Садко, 1 этаж.'
}

const statusIcons: Record<string, string> = {
	pending: '⌛ Ожидание оплаты',
	payed: '💳 Оплата заказа',
	shipped: '🚚 Отправлен заказ',
	delivered: '✅ Доставлен заказ',
	cancelled: '⛔ Отмена заказа',
	ready_to_receive: '🚀 Заказ готов к получению'
}

const statusIconsPickup: Record<string, string> = {
	...statusIcons,
	delivered: '✅ Заказ получен',
	ready_to_receive: '🏪 Заказ готов к выдаче'
}

function isPickup(deliveryMethod?: string | null): boolean {
	if (!deliveryMethod) return false
	const lower = deliveryMethod.toLowerCase()
	return lower.includes('самовывоз') || lower === 'pickup'
}

export const getOrderStatusIcons = (
	status: string,
	deliveryMethod?: string | null
): string => {
	const map = isPickup(deliveryMethod) ? statusIconsPickup : statusIcons
	return map[status] || '❓ Статус заказа не известен'
}

export const getOrderStatusTranslation = (
	status: string,
	deliveryMethod?: string | null
): string => {
	const map = isPickup(deliveryMethod)
		? statusTranslationsPickup
		: statusTranslations
	return map[status] || 'Неизвестный статус'
}
