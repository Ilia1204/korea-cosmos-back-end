interface EmailCodeEntry {
	code: string
	expiresAt: number
	sentAt: number
	attempts: number
}

class EmailVerificationStore {
	private store = new Map<string, EmailCodeEntry>()
	private readonly TTL = 10 * 60 * 1000
	private readonly COOLDOWN = 60 * 1000
	private readonly MAX_ATTEMPTS = 5

	canSet(email: string): boolean {
		const existing = this.store.get(email)
		return !(existing && Date.now() - existing.sentAt < this.COOLDOWN)
	}

	set(email: string, code: string): void {
		this.store.set(email, {
			code,
			expiresAt: Date.now() + this.TTL,
			sentAt: Date.now(),
			attempts: 0
		})
	}

	verify(
		email: string,
		code: string
	): 'ok' | 'expired' | 'invalid' | 'too_many_attempts' {
		const entry = this.store.get(email)
		if (!entry) return 'expired'
		if (Date.now() > entry.expiresAt) {
			this.store.delete(email)
			return 'expired'
		}
		if (entry.attempts >= this.MAX_ATTEMPTS) {
			this.store.delete(email)
			return 'too_many_attempts'
		}
		if (entry.code !== code) {
			entry.attempts += 1
			return 'invalid'
		}
		this.store.delete(email)
		return 'ok'
	}
}

export const emailVerificationStore = new EmailVerificationStore()
