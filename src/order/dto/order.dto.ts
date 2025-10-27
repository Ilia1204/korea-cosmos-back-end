import {
	EnumDeliveryMethod,
	EnumOrderStatus,
	EnumRecipientDetails
} from '@prisma/client'
import { Type } from 'class-transformer'
import {
	IsArray,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	ValidateNested
} from 'class-validator'

export class OrderDto {
	@IsString()
	@IsOptional()
	comment: string

	@IsString()
	@IsOptional()
	coupon: string

	@IsOptional()
	@IsEnum(EnumDeliveryMethod)
	deliveryMethod: EnumDeliveryMethod

	@IsOptional()
	@IsNumber()
	deliveryPrice: number

	@IsOptional()
	@IsString()
	addressId: string

	@IsOptional()
	@IsEnum(EnumOrderStatus, { message: 'Статус заказа обязателен' })
	status: EnumOrderStatus

	@IsOptional()
	@IsEnum(EnumRecipientDetails)
	recipientDetails: EnumRecipientDetails

	@IsString()
	@IsOptional()
	recipientName: string

	@IsString()
	@IsOptional()
	recipientSurname: string

	@IsString()
	@IsOptional()
	recipientPhone: string

	@IsString()
	@IsOptional()
	recipientEmail: string

	@IsArray({ message: 'В заказе нет ни одного товара' })
	@ValidateNested({ each: true })
	@Type(() => OrderItemDto)
	items: OrderItemDto[]
}

export type UpdateOrderDto = Pick<OrderDto, 'status'>

export class OrderItemDto {
	@IsNumber()
	quantity: number

	@IsNumber()
	price: number

	@IsString()
	productId: string

	@IsString()
	@IsOptional()
	productName?: string

	@IsString()
	@IsOptional()
	productImage?: string
}
