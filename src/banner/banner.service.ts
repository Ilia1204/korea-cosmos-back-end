import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import axios from 'axios'
import { WooCacheService } from 'src/woo-proxy/woo-cache.service'

const CACHE_KEY = 'wp-banners-public'
const TTL_MS = 10 * 60 * 1000

@Injectable()
export class BannerService {
	private readonly logger = new Logger(BannerService.name)
	private readonly api = axios.create({
		baseURL: `${process.env.WP_URL}/wp-json/wp/v2`
	})

	constructor(private readonly cache: WooCacheService) {}

	@Cron(CronExpression.EVERY_10_MINUTES)
	async warmBannersCache() {
		try {
			await this.fetchAndCache()
		} catch (err) {
			this.logger.warn(`[warmBannersCache] failed: ${err}`)
		}
	}

	private async fetchAndCache() {
		const res = await this.api.get('/banners-mobile', {
			params: { per_page: 20, status: 'publish' }
		})
		this.cache.store(CACHE_KEY, res.data, TTL_MS)
		return res.data
	}

	async getPublicAll() {
		const cached = this.cache.hit<any[]>(CACHE_KEY)
		if (cached) return cached
		return this.fetchAndCache()
	}
}
