import {
	IsBoolean,
	IsIn,
	IsNumber,
	IsOptional,
	IsString
} from 'class-validator'

export class WooCouponDto {
	@IsString()
	code: string

	@IsIn(['percent', 'fixed_cart', 'fixed_product'])
	discount_type: 'percent' | 'fixed_cart' | 'fixed_product'

	@IsString()
	amount: string

	@IsString()
	@IsOptional()
	description?: string

	@IsString()
	@IsOptional()
	date_expires?: string

	@IsNumber()
	@IsOptional()
	usage_limit?: number

	@IsString()
	@IsOptional()
	minimum_amount?: string

	@IsBoolean()
	@IsOptional()
	individual_use?: boolean

	@IsNumber()
	@IsOptional()
	usage_limit_per_user?: number
}
