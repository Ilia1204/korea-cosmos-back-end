import { IsArray, IsBoolean, IsOptional, IsString, IsNumber } from 'class-validator'
import { Transform, Type } from 'class-transformer'

export class WcProductQueryDto {
	@IsOptional() @IsNumber() @Type(() => Number) page?: number
	@IsOptional() @IsNumber() @Type(() => Number) per_page?: number
	@IsOptional() @IsString() search?: string
	@IsOptional() @IsNumber() @Type(() => Number) category?: number
	@IsOptional() @IsNumber() @Type(() => Number) tag?: number
	@IsOptional() @IsString() stock_status?: string
	@IsOptional() @IsString() status?: string
	@IsOptional() @IsString() type?: string
	@IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) on_sale?: boolean
}

export class WcCategoryRefDto {
	@IsNumber() id: number
}

export class WcProductUpdateDto {
	@IsOptional() @IsString() name?: string
	@IsOptional() @IsString() short_description?: string
	@IsOptional() @IsString() description?: string
	@IsOptional() @IsString() regular_price?: string
	@IsOptional() @IsString() sale_price?: string
	@IsOptional() @IsString() sku?: string
	@IsOptional() @IsString() weight?: string
	@IsOptional() @IsString() stock_status?: string
	@IsOptional() @IsString() status?: string
	@IsOptional() @IsArray() categories?: WcCategoryRefDto[]
	@IsOptional() @IsArray() tags?: WcCategoryRefDto[]
}
