import { Injectable } from '@nestjs/common'

@Injectable()
export class WooApiClient {
	private readonly auth =
		'Basic ' +
		Buffer.from(
			`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
		).toString('base64')

	get headers() {
		return { Authorization: this.auth }
	}

	get jsonHeaders() {
		return { ...this.headers, 'Content-Type': 'application/json' }
	}

	async get(path: string, params?: Record<string, string>) {
		const url = new URL(`${process.env.WP_URL}/wp-json/wc/v3/${path}`)
		if (params)
			Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
		const res = await fetch(url.toString(), { headers: this.headers })
		return res
	}

	async post(path: string, body: any) {
		return fetch(`${process.env.WP_URL}/wp-json/wc/v3/${path}`, {
			method: 'POST',
			headers: this.jsonHeaders,
			body: JSON.stringify(body)
		})
	}

	async put(path: string, body: any) {
		return fetch(`${process.env.WP_URL}/wp-json/wc/v3/${path}`, {
			method: 'PUT',
			headers: this.jsonHeaders,
			body: JSON.stringify(body)
		})
	}

	async getCustomerId(email: string): Promise<number | null> {
		try {
			const res = await this.get('customers', { email, role: 'all' })
			const data = await res.json()
			return data[0]?.id ?? null
		} catch {
			return null
		}
	}
}
