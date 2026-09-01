import { Injectable } from '@nestjs/common'
import axios from 'axios'

@Injectable()
export class WpPostClient {
	private readonly api = axios.create({
		baseURL: `${process.env.WP_URL}/wp-json/wp/v2`,
		auth: {
			username: process.env.WP_APP_USER,
			password: process.env.WP_APP_PASSWORD
		}
	})

	async getAll(searchTerm?: string) {
		const res = await this.api.get('/blog-posts', {
			params: {
				per_page: 50,
				status: 'publish,future,draft,pending',
				_embed: 'wp:featuredmedia',
				orderby: 'date',
				order: 'desc',
				...(searchTerm && { search: searchTerm })
			}
		})
		return res.data as any[]
	}

	async getPublicPage(page: number, perPage: number) {
		const res = await this.api.get('/blog-posts', {
			params: {
				per_page: perPage,
				page,
				status: 'publish',
				_embed: 'wp:featuredmedia'
			}
		})
		return {
			data: res.data as any[],
			totalPages: Number(res.headers['x-wp-totalpages'] ?? 1)
		}
	}

	async getPublicBySlug(slug: string) {
		const res = await this.api.get('/blog-posts', {
			params: { slug, _embed: 'wp:featuredmedia' }
		})
		return res.data as any[]
	}

	async getById(id: number) {
		const res = await this.api.get(`/blog-posts/${id}`, {
			params: { _embed: 'wp:featuredmedia' }
		})
		return res.data
	}

	async update(id: number, data: Record<string, unknown>) {
		const res = await this.api.post(`/blog-posts/${id}`, data)
		return res.data
	}

	async create(data: Record<string, unknown>) {
		const res = await this.api.post('/blog-posts', data)
		return res.data
	}

	async delete(id: number) {
		const res = await this.api.delete(`/blog-posts/${id}`, {
			params: { force: true }
		})
		return res.data
	}

	async uploadMedia(file: Express.Multer.File) {
		const res = await this.api.post('/media', file.buffer, {
			headers: {
				'Content-Disposition': `attachment; filename="${file.originalname}"`,
				'Content-Type': file.mimetype
			}
		})
		return res.data
	}
}
