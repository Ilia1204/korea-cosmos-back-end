import { Prisma } from '@prisma/client'
import {
	IsArray,
	IsBoolean,
	IsNumber,
	IsOptional,
	IsString
} from 'class-validator'

export class ProductDto implements Prisma.ProductUpdateInput {
	@IsString()
	name: string

	@IsNumber()
	price: number

	@IsOptional()
	@IsString()
	description: string

	@IsOptional()
	@IsString()
	composition: string

	@IsOptional()
	@IsNumber()
	rating: number

	@IsOptional()
	@IsArray()
	tags: string[]

	@IsOptional()
	@IsString()
	weight: string

	@IsOptional()
	images: string[]

	@IsOptional()
	@IsNumber()
	newPrice: number

	@IsOptional()
	@IsNumber()
	discount: number

	@IsOptional()
	@IsBoolean()
	isPublic: boolean

	@IsOptional()
	@IsNumber()
	stock: number

	@IsString()
	categoryId: string

	@IsOptional()
	@IsString()
	labelProductId: string
}
