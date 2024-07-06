import {
	IsBoolean,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	Min
} from 'class-validator'

export class ReviewDto {
	@IsOptional()
	@IsString()
	message: string

	@IsString({ each: true })
	@IsOptional()
	images: string[]

	@IsOptional()
	@IsBoolean()
	isPublic: boolean

	@IsOptional()
	@IsNumber()
	@Min(1)
	@Max(5)
	rating: number
}
