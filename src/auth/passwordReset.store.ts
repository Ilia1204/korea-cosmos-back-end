class PasswordResetStore {
	private lastSentAt = new Map<string, number>()
	private readonly COOLDOWN = 60 * 1000

	canSend(email: string): boolean {
		const last = this.lastSentAt.get(email)
		return !(last && Date.now() - last < this.COOLDOWN)
	}

	markSent(email: string): void {
		this.lastSentAt.set(email, Date.now())
	}
}

export const passwordResetStore = new PasswordResetStore()
