import { Controller, Get, HttpCode } from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { LoyaltyService } from './loyalty.service'

@Controller('loyalty')
export class LoyaltyController {
	constructor(private readonly loyaltyService: LoyaltyService) {}

	@HttpCode(200)
	@Get('discount')
	@Auth()
	async getDiscount(@CurrentUser('id') userId: string) {
		return this.loyaltyService.calculateDiscount(userId)
	}
}
