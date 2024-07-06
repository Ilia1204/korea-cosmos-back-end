import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/prisma.service'
import { generateSlug } from 'src/utils/generate-slug'
import { UpdatePostDto } from './post.dto'
import { returnFullestPostObject, returnPostObject } from './return-post.object'

@Injectable()
export class PostService {
	constructor(private prisma: PrismaService) {}

	async getById(id: string) {
		return this.prisma.post.findUnique({
			where: { id },
			select: returnFullestPostObject
		})
	}

	async getBySlug(slug: string) {
		return this.prisma.post.findUnique({
			where: { slug },
			select: { description: true, ...returnPostObject }
		})
	}

	async getPosts(
		isPublic = true,
		selectObject: Prisma.PostSelect = returnPostObject
	) {
		return this.prisma.post.findMany({
			where: { isPublic },
			select: selectObject,
			orderBy: {
				createdAt: 'desc'
			}
		})
	}

	async create() {
		return this.prisma.post.create({
			data: {
				title: '',
				slug: '',
				image: '',
				description: ''
			}
		})
	}

	updateCountViews(slug: string) {
		return this.prisma.post.update({
			where: { slug },
			data: {
				countViews: {
					increment: 1
				}
			}
		})
	}

	async update(id: string, dto: UpdatePostDto) {
		const post = await this.getById(id)

		if (!post) throw new NotFoundException('Пост не найден')

		return this.prisma.post.update({
			where: { id },
			data: {
				title: dto.title,
				slug: generateSlug(dto.title),
				description: dto.description,
				image: dto.image,
				isPublic: dto.isPublic
			}
		})
	}

	async delete(id: string) {
		const post = await this.getById(id)

		if (!post) throw new NotFoundException('Пост не найден')

		return this.prisma.post.delete({
			where: {
				id
			}
		})
	}

	async toggleLikePost(postId: string, userId: string) {
		const post = await this.getById(postId)

		if (!post) throw new NotFoundException('Пост не найден')

		const userLiked = post.likesIdsUsers.includes(userId)

		const updatedLikes = userLiked
			? post.likesIdsUsers.filter(likedUserId => likedUserId !== userId)
			: [...post.likesIdsUsers, userId]

		await this.prisma.post.update({
			where: { id: postId },
			data: { likesIdsUsers: updatedLikes, countLikes: updatedLikes.length }
		})

		return !userLiked
	}

	async toggleFavorite(postId: string, userId: string) {
		const post = await this.getById(postId)
		if (!post) throw new NotFoundException('Пост не найден')

		const isLiked = post.likesIdsUsers.includes(userId)

		await this.prisma.post.update({
			where: {
				id: post.id
			},
			data: {
				countLikes: {
					[isLiked ? 'decrement' : 'increment']: 1
				},
				likesIdsUsers: isLiked
					? post.likesIdsUsers.filter(likedUserId => likedUserId !== userId)
					: [...post.likesIdsUsers, userId]
			}
		})

		return {
			message: isLiked ? 'Пост убран из лайков' : 'Пост лайкнут'
		}
	}
}
