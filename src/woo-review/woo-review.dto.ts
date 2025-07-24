import {
	IsArray,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	Min
} from 'class-validator'

export class WooReviewDto {
	@IsString()
	message: string

	@IsNumber()
	@Min(1)
	@Max(5)
	rating: number

	@IsArray()
	@IsString({ each: true })
	@IsOptional()
	images?: string[]

	@IsNumber()
	wooProductId: number
}
