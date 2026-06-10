import { IsNumber, IsString } from 'class-validator'

export class CartItemDto {
	@IsString()
	productId: string

	@IsNumber()
	quantity: number

	@IsNumber()
	price: number
}
