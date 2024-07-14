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
	@IsNumber()
	weight: number

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
	@IsBoolean()
	inStock: boolean

	@IsArray()
	@IsString({ each: true })
	@IsString()
	categories: string[]

	@IsOptional()
	@IsString()
	labelProductId: string
}

export type UpdateProductDto = Partial<ProductDto>
