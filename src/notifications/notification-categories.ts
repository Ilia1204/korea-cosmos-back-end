export const NOTIFICATION_CATEGORIES = [
	'orders',
	'promotions',
	'stock',
	'loyalty',
	'reminders',
	'chat'
] as const

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export type NotificationPreferences = Partial<
	Record<NotificationCategory, boolean>
>

export function isCategoryEnabled(
	preferences: unknown,
	category: NotificationCategory
): boolean {
	if (!preferences || typeof preferences !== 'object') return true
	const value = (preferences as NotificationPreferences)[category]
	return value !== false
}
