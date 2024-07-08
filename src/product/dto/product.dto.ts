import {
	IsArray,
	IsBoolean,
	IsNumber,
	IsOptional,
	IsString
} from 'class-validator'

export class ProductDto {
	@IsString()
	name: string

	@IsNumber()
	price: number

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
	categoriesIds: string[]

	@IsOptional()
	@IsString()
	labelProductId: string
}

export type UpdateProductDto = Partial<ProductDto>
