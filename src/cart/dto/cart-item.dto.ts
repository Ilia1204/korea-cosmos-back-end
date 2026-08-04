import { IsNumber, IsOptional, IsString } from 'class-validator'

export class CartItemDto {
	@IsString()
	productId: string

	@IsNumber()
	@IsOptional()
	variationId?: number

	@IsNumber()
	quantity: number

	@IsNumber()
	price: number

	@IsString()
	@IsOptional()
	productName?: string

	@IsString()
	@IsOptional()
	productImage?: string
}
