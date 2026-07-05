import { IsNumber, IsOptional, IsString } from 'class-validator'

export class LoyaltyLevelDto {
	@IsOptional()
	@IsString()
	name?: string

	@IsOptional()
	@IsNumber()
	discount?: number

	@IsOptional()
	@IsNumber()
	minAmount?: number
}

export type UpdateLoyaltyLevelDto = Partial<LoyaltyLevelDto>
