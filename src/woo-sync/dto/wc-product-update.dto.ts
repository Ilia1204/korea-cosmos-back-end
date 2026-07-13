import { IsArray, IsOptional, IsString } from 'class-validator'
import { WcCategoryRefDto } from './wc-product-dto'

export class WcProductUpdateDto {
	@IsOptional()
	@IsString()
	name?: string

	@IsOptional()
	@IsString()
	short_description?: string

	@IsOptional()
	@IsString()
	description?: string

	@IsOptional()
	@IsString()
	regular_price?: string

	@IsOptional()
	@IsString()
	sale_price?: string

	@IsOptional()
	@IsString()
	sku?: string

	@IsOptional()
	@IsString()
	weight?: string

	@IsOptional()
	@IsString()
	stock_status?: string

	@IsOptional()
	@IsString()
	status?: string

	@IsOptional()
	@IsArray()
	categories?: WcCategoryRefDto[]

	@IsOptional()
	@IsArray()
	tags?: WcCategoryRefDto[]
}
