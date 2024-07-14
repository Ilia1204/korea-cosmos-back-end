import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { generateSlug } from 'src/utils/generate-slug'
import { returnSectionObject } from './return-section.object'
import { SectionDto } from './section.dto'

@Injectable()
export class SectionService {
	constructor(private prisma: PrismaService) {}

	getById(id: string) {
		return this.prisma.section.findUnique({
			where: { id },
			select: returnSectionObject
		})
	}

	getBySlug(slug: string) {
		return this.prisma.section.findUnique({
			where: { slug },
			select: returnSectionObject
		})
	}

	async getAll(searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm)

		return this.prisma.section.findMany({
			select: returnSectionObject
		})
	}

	private async search(searchTerm: string) {
		return this.prisma.section.findMany({
			where: {
				OR: [
					{
						name: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					},
					{
						categories: {
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
		return this.prisma.section.create({
			data: {
				name: '',
				slug: ''
			}
		})
	}

	async update(id: string, dto: SectionDto) {
		const section = await this.getById(id)

		if (!section) throw new NotFoundException('Раздел не найден')

		return this.prisma.section.update({
			where: { id },
			data: {
				name: dto.name,
				slug: generateSlug(dto.name)
			}
		})
	}

	async delete(id: string) {
		const section = await this.getById(id)

		if (!section) throw new NotFoundException('Раздел не найден')

		return this.prisma.section.delete({
			where: {
				id
			}
		})
	}
}
