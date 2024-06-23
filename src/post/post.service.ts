import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/prisma.service'
import { generateSlug } from 'src/utils/generate-slug'
import { PostDto } from './post.dto'
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
		await this.updateCountViews(slug)

		return this.prisma.post.findUnique({
			where: { slug },
			select: returnPostObject
		})
	}

	async getPosts(
		isPublic = true,
		selectObject: Prisma.PostSelect = returnPostObject
	) {
		return this.prisma.post.findMany({
			where: { isPublic },
			select: selectObject
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

	async updateCountViews(slug: string) {
		const post = await this.prisma.post.findUnique({ where: { slug } })

		if (post)
			await this.prisma.post.update({
				where: { slug },
				data: { countViews: { increment: 1 } }
			})
	}

	async update(id: string, dto: PostDto) {
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
}
