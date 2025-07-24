import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { CarouselDto } from './dto/carousel.dto'
import { returnCarouselObject } from './return-carousel.object'

@Injectable()
export class CarouselService {
	constructor(private prisma: PrismaService) {}

	async getById(id: string) {
		const carousel = await this.prisma.carousel.findUnique({
			where: { id },
			select: returnCarouselObject
		})
		if (!carousel) throw new NotFoundException('Баннер не найден')

		return carousel
	}

	async getAll(searchTerm?: string) {
		if (searchTerm) return this.search(searchTerm)

		return this.prisma.carousel.findMany({
			select: returnCarouselObject,
			orderBy: {
				order: 'asc'
			}
		})
	}

	private async search(searchTerm: string) {
		return this.prisma.carousel.findMany({
			where: {
				OR: [
					{
						bannerSlug: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					}
				]
			}
		})
	}

	async create() {
		return this.prisma.carousel.create({
			data: {
				imagePath: '',
				bannerType: 'ProductDetails',
				bannerSlug: '',
				order: 1
			}
		})
	}

	async update(id: string, dto: Partial<CarouselDto>) {
		return this.prisma.carousel.update({
			where: { id },
			data: dto
		})
	}

	async delete(id: string) {
		await this.getById(id)

		return this.prisma.carousel.delete({
			where: { id }
		})
	}

	async updateOrder(ids: string[]): Promise<any[]> {
		return this.prisma.$transaction(
			ids.map((id, order) =>
				this.prisma.carousel.update({
					where: { id },
					data: { order }
				})
			)
		)
	}
}
