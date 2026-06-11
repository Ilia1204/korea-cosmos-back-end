export const STATS_CACHE_TTL_MS = 15 * 60 * 1000
export const TAB_CACHE_TTL_MS = 10 * 60 * 1000

export const RETAIL_STATUS_MAP: Record<string, string> = {
	new: 'pending',
	prepayed: 'payed',
	'client-confirmed': 'payed',
	'assembling-complete': 'shipped',
	'send-to-delivery': 'shipped',
	delivering: 'shipped',
	complete: 'delivered',
	'cancel-other': 'cancelled',
	'no-call': 'cancelled',
	'no-product': 'cancelled'
}
