import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { SectionService } from 'src/section/section.service'
import { generateSlug } from 'src/utils/generate-slug'
import { CategoryDto } from './category.dto'
import { returnCategoryObject } from './return-category.object'

@Injectable()
export class CategoryService {
	constructor(
		private prisma: PrismaService,
		private sectionService: SectionService
	) {}

	getById(id: string) {
		return this.prisma.category.findUnique({
			where: { id },
			select: returnCategoryObject
		})
	}

	getBySlug(slug: string) {
		return this.prisma.category.findUnique({
			where: { slug },
			select: returnCategoryObject
		})
	}

	async getBySection(sectionSlug: string) {
		const categories = await this.prisma.category.findMany({
			where: {
				section: {
					slug: sectionSlug
				}
			},
			select: returnCategoryObject
		})

		return categories
	}

	async getSimilar(id: string) {
		const currentCategory = await this.getById(id)

		if (!currentCategory)
			throw new NotFoundException('Текущая категория не найдена')

		const categories = await this.prisma.category.findMany({
			where: {
				section: {
					name: currentCategory.section.name
				},
				NOT: {
					id: currentCategory.id
				}
			},
			orderBy: {
				createdAt: 'desc'
			},
			select: returnCategoryObject
		})

		return categories
	}

	async getAll(searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm)

		return this.prisma.category.findMany({
			select: returnCategoryObject
		})
	}

	private async search(searchTerm: string) {
		return this.prisma.category.findMany({
			where: {
				OR: [
					{
						name: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						section: {
							name: {
								contains: searchTerm,
								mode: 'insensitive'
							}
						}
					},
					{
						products: {
							some: {
								name: {
									contains: searchTerm,
									mode: 'insensitive'
								}
							}
						}
					}
				]
			}
		})
	}

	async create() {
		return this.prisma.category.create({
			data: {
				name: '',
				slug: ''
			}
		})
	}

	async update(id: string, dto: CategoryDto) {
		const { name, sectionId } = dto

		const section = this.sectionService.getById(sectionId)
		const category = await this.getById(id)

		if (!section) throw new NotFoundException('Раздел не найден')
		if (!category) throw new NotFoundException('Категория не найдена')

		return this.prisma.category.update({
			where: { id },
			data: {
				name,
				slug: generateSlug(name),
				section: {
					connect: {
						id: sectionId
					}
				}
			}
		})
	}

	async delete(id: string) {
		const category = await this.getById(id)

		if (!category) throw new NotFoundException('Категория не найдена')

		return this.prisma.category.delete({
			where: {
				id
			}
		})
	}
}
