import { Injectable, OnModuleDestroy } from '@nestjs/common'

const SWEEP_INTERVAL_MS = 5 * 60 * 1000

@Injectable()
export class WooCacheService implements OnModuleDestroy {
	private readonly cache = new Map<string, { data: any; expires: number }>()

	private readonly sweepInterval = setInterval(() => {
		const now = Date.now()
		for (const [key, entry] of this.cache) {
			if (entry.expires <= now) this.cache.delete(key)
		}
	}, SWEEP_INTERVAL_MS)

	onModuleDestroy() {
		clearInterval(this.sweepInterval)
	}

	hit<T>(key: string): T | null {
		const entry = this.cache.get(key)
		if (entry && entry.expires > Date.now()) return entry.data as T
		return null
	}

	store(key: string, data: any, ttlMs: number) {
		this.cache.set(key, { data, expires: Date.now() + ttlMs })
	}

	invalidateProducts() {
		for (const key of this.cache.keys()) {
			if (
				key.startsWith('products?') ||
				key.startsWith('paginated?') ||
				/^products\/\d+(\/|$)/.test(key)
			) {
				this.cache.delete(key)
			}
		}
	}
}
