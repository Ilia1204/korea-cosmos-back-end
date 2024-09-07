import { IsNumber, IsString } from 'class-validator'

export class LoyaltyLevelDto {
	@IsString()
	name: string

	@IsNumber()
	discount: number

	@IsNumber()
	minAmount: number
}

export type UpdateLoyaltyLevelDto = Partial<LoyaltyLevelDto>
