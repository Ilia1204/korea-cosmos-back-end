interface CallCheckEntry {
	checkId: string
	expiresAt: number
	sentAt: number
}

class CallCheckStore {
	private store = new Map<string, CallCheckEntry>()
	private readonly TTL = 5 * 60 * 1000
	private readonly COOLDOWN = 60 * 1000

	canSet(phone: string): boolean {
		const existing = this.store.get(phone)
		return !(existing && Date.now() - existing.sentAt < this.COOLDOWN)
	}

	set(phone: string, checkId: string): void {
		this.store.set(phone, {
			checkId,
			expiresAt: Date.now() + this.TTL,
			sentAt: Date.now()
		})
	}

	getCheckId(phone: string): string | null {
		const entry = this.store.get(phone)
		if (!entry) return null
		if (Date.now() > entry.expiresAt) {
			this.store.delete(phone)
			return null
		}
		return entry.checkId
	}

	delete(phone: string): void {
		this.store.delete(phone)
	}
}

export const callCheckStore = new CallCheckStore()
