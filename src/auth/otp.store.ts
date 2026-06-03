interface OtpEntry {
	code: string
	expiresAt: number
	attempts: number
	sentAt: number
}

class OtpStore {
	private store = new Map<string, OtpEntry>()
	private readonly TTL = 5 * 60 * 1000
	private readonly COOLDOWN = 60 * 1000
	private readonly MAX_ATTEMPTS = 3

	set(phone: string, code: string): boolean {
		const existing = this.store.get(phone)
		if (existing && Date.now() - existing.sentAt < this.COOLDOWN) {
			return false
		}
		this.store.set(phone, {
			code,
			expiresAt: Date.now() + this.TTL,
			attempts: 0,
			sentAt: Date.now()
		})
		return true
	}

	verify(phone: string, code: string): 'ok' | 'expired' | 'invalid' | 'exceeded' {
		const entry = this.store.get(phone)
		if (!entry) return 'expired'
		if (Date.now() > entry.expiresAt) {
			this.store.delete(phone)
			return 'expired'
		}
		if (entry.attempts >= this.MAX_ATTEMPTS) return 'exceeded'

		if (entry.code !== code) {
			entry.attempts++
			return 'invalid'
		}

		this.store.delete(phone)
		return 'ok'
	}

	has(phone: string): boolean {
		const entry = this.store.get(phone)
		if (!entry) return false
		if (Date.now() > entry.expiresAt) {
			this.store.delete(phone)
			return false
		}
		return true
	}
}

export const otpStore = new OtpStore()
