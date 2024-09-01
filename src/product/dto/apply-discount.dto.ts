import {
	IsBoolean,
	IsDateString,
	IsNumber,
	IsOptional,
	IsString
} from 'class-validator'

export class ApplyDiscountDto {
	@IsString()
	categoryId: string

	@IsNumber()
	discount: number

	@IsOptional()
	@IsBoolean()
	isSentNotification?: boolean

	@IsOptional()
	@IsString()
	title?: string

	@IsOptional()
	@IsString()
	message?: string

	@IsOptional()
	@IsDateString()
	startDate?: string

	@IsOptional()
	@IsDateString()
	endDate?: string
}
