export const WC_TO_LOCAL: Record<string, string> = {
	pending: 'pending',
	processing: 'payed',
	'on-hold': 'pending',
	delivering: 'shipped',
	completed: 'delivered',
	cancelled: 'cancelled',
	refunded: 'cancelled',
	failed: 'cancelled'
}

export const LOCAL_TO_WC: Record<string, string> = {
	pending: 'pending',
	payed: 'processing',
	shipped: 'delivering',
	ready_to_receive: 'on-hold',
	delivered: 'completed',
	cancelled: 'cancelled'
}
