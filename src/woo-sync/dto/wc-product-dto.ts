import { IsBoolean, IsOptional, IsString, IsNumber } from 'class-validator'
import { Transform, Type } from 'class-transformer'

export class WcProductQueryDto {
	@IsOptional()
	@IsNumber()
	@Type(() => Number)
	page?: number

	@IsOptional()
	@IsNumber()
	@Type(() => Number)
	per_page?: number

	@IsOptional()
	@IsString()
	search?: string

	@IsOptional()
	@IsNumber()
	@Type(() => Number)
	category?: number

	@IsOptional()
	@IsNumber()
	@Type(() => Number)
	tag?: number

	@IsOptional()
	@IsString()
	stock_status?: string

	@IsOptional()
	@IsString()
	status?: string

	@IsOptional()
	@IsString()
	type?: string

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	on_sale?: boolean
}

export class WcCategoryRefDto {
	@IsNumber() id: number
}
