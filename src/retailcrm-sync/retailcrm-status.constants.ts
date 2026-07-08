export const RETAILCRM_TO_LOCAL: Record<string, string> = {
	prepayed: 'payed',
	'client-confirmed': 'payed',
	'send-to-delivery': 'shipped',
	delivering: 'shipped',
	complete: 'delivered',
	'cancel-other': 'cancelled',
	'no-call': 'cancelled',
	'no-product': 'cancelled',
	'assembling-complete': 'ready_to_receive'
}

export const LOCAL_TO_RETAILCRM: Record<string, string> = {
	pending: 'new',
	payed: 'prepayed',
	shipped: 'send-to-delivery',
	delivered: 'complete',
	cancelled: 'cancel-other',
	ready_to_receive: 'assembling-complete'
}
