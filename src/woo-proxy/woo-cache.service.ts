import { Injectable } from '@nestjs/common'

@Injectable()
export class WooCacheService {
	private readonly cache = new Map<string, { data: any; expires: number }>()

	hit<T>(key: string): T | null {
		const entry = this.cache.get(key)
		if (entry && entry.expires > Date.now()) return entry.data as T
		return null
	}

	store(key: string, data: any, ttlMs: number) {
		this.cache.set(key, { data, expires: Date.now() + ttlMs })
	}

	// Called after an admin product edit so stale cached responses (product
	// detail, product lists, slug lookups) aren't served for up to their TTL.
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
