import {
	IsBoolean,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	Min
} from 'class-validator'

export class ReviewDto {
	@IsString()
	message: string

	@IsOptional()
	@IsString()
	imagePath: string

	@IsOptional()
	@IsBoolean()
	isPublic: boolean

	@IsNumber()
	@Min(1)
	@Max(5)
	rating: number
}
