import {
	IsBoolean,
	IsDate,
	IsNumber,
	IsOptional,
	IsString
} from 'class-validator'

export class PromoCodeDto {
	@IsString()
	code: string

	@IsNumber()
	discount: number

	@IsString()
	@IsOptional()
	description: string

	@IsString()
	@IsOptional()
	category: string

	@IsNumber()
	@IsOptional()
	minOrderSum: number

	@IsOptional()
	@IsBoolean()
	isActive: boolean

	@IsDate()
	@IsOptional()
	expiryDate: string
}
