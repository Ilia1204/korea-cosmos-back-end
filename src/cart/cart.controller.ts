import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { ICartItemInput, CartService } from './cart.service'

@Controller('cart')
export class CartController {
	constructor(private readonly cartService: CartService) {}

	@Get()
	@Auth()
	async getCart(@CurrentUser('id') userId: string) {
		return this.cartService.getCart(userId)
	}

	@Post('sync')
	@Auth()
	@HttpCode(200)
	async syncCart(
		@CurrentUser('id') userId: string,
		@Body('items') items: ICartItemInput[]
	) {
		return this.cartService.syncCart(userId, items)
	}

	@Delete()
	@Auth()
	@HttpCode(200)
	async clearCart(@CurrentUser('id') userId: string) {
		return this.cartService.clearCart(userId)
	}
}
