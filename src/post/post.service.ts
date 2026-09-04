import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from 'src/prisma.service'
import { WooCacheService } from 'src/woo-proxy/woo-cache.service'
import { UpdateWpPostDto } from './post.dto'
import { WpPostClient } from './wp-post.client'
import { mapWpPostAdmin } from './wp-post.mapper'

const PUBLIC_PAGE_TTL_MS = 3 * 60 * 1000
const PUBLIC_SLUG_TTL_MS = 5 * 60 * 1000

@Injectable()
export class PostService {
	private readonly logger = new Logger(PostService.name)

	constructor(
		private prisma: PrismaService,
		private wpPostClient: WpPostClient,
		private cache: WooCacheService
	) {}

	@Cron(CronExpression.EVERY_5_MINUTES)
	async warmPublicPostsCache() {
		try {
			await this.fetchAndCachePage(1, 10)
		} catch (err) {
			this.logger.warn(`[warmPublicPostsCache] failed: ${err}`)
		}
	}

	private async fetchAndCachePage(page: number, perPage: number) {
		const key = `wp-posts-public?page=${page}&perPage=${perPage}`
		const result = await this.wpPostClient.getPublicPage(page, perPage)
		this.cache.store(key, result, PUBLIC_PAGE_TTL_MS)
		return result
	}

	async getPublicPage(page = 1, perPage = 10) {
		const key = `wp-posts-public?page=${page}&perPage=${perPage}`
		const cached = this.cache.hit<{ data: any[]; totalPages: number }>(key)
		if (cached) return cached
		return this.fetchAndCachePage(page, perPage)
	}

	async getPublicBySlug(slug: string) {
		const key = `wp-post-public?slug=${slug}`
		const cached = this.cache.hit<any[]>(key)
		if (cached) return cached
		const result = await this.wpPostClient.getPublicBySlug(slug)
		this.cache.store(key, result, PUBLIC_SLUG_TTL_MS)
		return result
	}

	async getWpEngagement(slug: string) {
		const post = await this.prisma.post.findUnique({ where: { slug } })
		return {
			countViews: post?.countViews ?? 0,
			countLikes: post?.countLikes ?? 0,
			likesIdsUsers: post?.likesIdsUsers ?? [],
			id: post?.id ?? null
		}
	}

	async getWpEngagementBatch(slugs: string[]) {
		if (!slugs.length) return {}
		const posts = await this.prisma.post.findMany({
			where: { slug: { in: slugs } }
		})
		const bySlug = new Map(posts.map(p => [p.slug, p]))

		const result: Record<
			string,
			{
				countViews: number
				countLikes: number
				likesIdsUsers: string[]
				id: string | null
			}
		> = {}
		for (const slug of slugs) {
			const post = bySlug.get(slug)
			result[slug] = {
				countViews: post?.countViews ?? 0,
				countLikes: post?.countLikes ?? 0,
				likesIdsUsers: post?.likesIdsUsers ?? [],
				id: post?.id ?? null
			}
		}
		return result
	}

	async incrementWpViews(slug: string) {
		return this.prisma.post.upsert({
			where: { slug },
			update: { countViews: { increment: 1 } },
			create: {
				slug,
				title: slug,
				image: '',
				description: '',
				isPublic: true,
				countViews: 1
			}
		})
	}

	async toggleWpLike(slug: string, userId: string) {
		const post = await this.prisma.post.upsert({
			where: { slug },
			update: {},
			create: {
				slug,
				title: slug,
				image: '',
				description: '',
				isPublic: true
			}
		})

		const liked = post.likesIdsUsers.includes(userId)
		const updatedLikes = liked
			? post.likesIdsUsers.filter(id => id !== userId)
			: [...post.likesIdsUsers, userId]

		await this.prisma.post.update({
			where: { id: post.id },
			data: { likesIdsUsers: updatedLikes, countLikes: updatedLikes.length }
		})

		return { liked: !liked, countLikes: updatedLikes.length }
	}

	async getAllWp(searchTerm?: string) {
		const posts = await this.wpPostClient.getAll(searchTerm)
		return posts.map(mapWpPostAdmin)
	}

	async getWpById(id: number) {
		const post = await this.wpPostClient.getById(id)
		return mapWpPostAdmin(post)
	}

	async createWp(dto: UpdateWpPostDto) {
		const post = await this.wpPostClient.create(this.toWpPayload(dto, true))
		return mapWpPostAdmin(post)
	}

	async updateWp(id: number, dto: UpdateWpPostDto) {
		const post = await this.wpPostClient.update(id, this.toWpPayload(dto))
		return mapWpPostAdmin(post)
	}

	async deleteWp(id: number) {
		return this.wpPostClient.delete(id)
	}

	async uploadWpMedia(file: Express.Multer.File) {
		const media = await this.wpPostClient.uploadMedia(file)
		return { id: media.id, url: media.source_url }
	}

	private toWpPayload(dto: UpdateWpPostDto, isCreate = false) {
		return {
			...(dto.title !== undefined && { title: dto.title }),
			...(dto.description !== undefined && { content: dto.description }),
			...(dto.slug !== undefined && { slug: dto.slug }),
			...(dto.status !== undefined && { status: dto.status }),
			...(dto.date !== undefined && { date: dto.date }),
			...(dto.featuredMediaId !== undefined && {
				featured_media: dto.featuredMediaId
			}),
			...(isCreate && dto.title === undefined && { title: '' }),
			...(isCreate && dto.description === undefined && { content: '' }),
			...(isCreate && dto.status === undefined && { status: 'draft' })
		}
	}
}
