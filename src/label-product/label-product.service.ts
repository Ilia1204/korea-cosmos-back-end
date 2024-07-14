import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { generateSlug } from 'src/utils/generate-slug'
import { LabelProductDto } from './label-product.dto'
import { returnLabelProductObject } from './return-label-product.object'

@Injectable()
export class LabelProductService {
	constructor(private prisma: PrismaService) {}

	getById(id: string) {
		return this.prisma.labelProduct.findUnique({
			where: { id },
			select: returnLabelProductObject
		})
	}

	getBySlug(slug: string) {
		return this.prisma.labelProduct.findUnique({
			where: { slug },
			select: { ...returnLabelProductObject, createdAt: true }
		})
	}

	async getAll() {
		return this.prisma.labelProduct.findMany({
			select: returnLabelProductObject
		})
	}

	async create() {
		return this.prisma.labelProduct.create({
			data: {
				name: '',
				slug: ''
			}
		})
	}

	async update(id: string, dto: LabelProductDto) {
		const labelProduct = await this.getById(id)

		if (!labelProduct) throw new NotFoundException('Метка не найдена')

		return this.prisma.labelProduct.update({
			where: { id },
			data: {
				name: dto.name,
				slug: generateSlug(dto.name)
			}
		})
	}

	async delete(id: string) {
		const labelProduct = await this.getById(id)

		if (!labelProduct) throw new NotFoundException('Метка не найдена')

		return this.prisma.labelProduct.delete({
			where: {
				id
			}
		})
	}
}
