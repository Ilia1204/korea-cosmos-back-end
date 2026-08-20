interface OtpEntry {
	code: string
	expiresAt: number
	sentAt: number
	attempts: number
}

class OtpCodeStore {
	private store = new Map<string, OtpEntry>()
	private readonly TTL = 5 * 60 * 1000
	private readonly COOLDOWN = 60 * 1000
	private readonly MAX_ATTEMPTS = 5

	canSet(phone: string): boolean {
		const existing = this.store.get(phone)
		return !(existing && Date.now() - existing.sentAt < this.COOLDOWN)
	}

	set(phone: string, code: string): void {
		this.store.set(phone, {
			code,
			expiresAt: Date.now() + this.TTL,
			sentAt: Date.now(),
			attempts: 0
		})
	}

	verify(
		phone: string,
		code: string
	): 'ok' | 'invalid' | 'expired' | 'too_many_attempts' {
		const entry = this.store.get(phone)
		if (!entry) return 'expired'
		if (Date.now() > entry.expiresAt) {
			this.store.delete(phone)
			return 'expired'
		}
		if (entry.attempts >= this.MAX_ATTEMPTS) {
			this.store.delete(phone)
			return 'too_many_attempts'
		}
		if (entry.code !== code) {
			entry.attempts += 1
			return 'invalid'
		}
		this.store.delete(phone)
		return 'ok'
	}

	delete(phone: string): void {
		this.store.delete(phone)
	}
}

export const otpCodeStore = new OtpCodeStore()
