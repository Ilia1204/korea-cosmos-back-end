import {
	IsArray,
	IsBoolean,
	IsIn,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	Min
} from 'class-validator'

export class ApplyWooDiscountDto {
	@IsIn(['category', 'section', 'product', 'label'])
	type: 'category' | 'section' | 'product' | 'label'

	@IsArray()
	@IsString({ each: true })
	ids: string[]

	@IsNumber()
	@Min(1)
	@Max(99)
	discount: number

	@IsString()
	@IsOptional()
	startDate?: string

	@IsString()
	@IsOptional()
	endDate?: string

	@IsBoolean()
	@IsOptional()
	isSentNotification?: boolean

	@IsString()
	@IsOptional()
	title?: string

	@IsString()
	@IsOptional()
	message?: string
}
