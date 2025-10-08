import { Controller, Get, Query, BadRequestException } from '@nestjs/common'
import { DeliveryService } from './delivery.service'

@Controller('delivery')
export class DeliveryController {
	constructor(private readonly deliveryService: DeliveryService) {}

	@Get('calculate')
	async calculate(
		@Query('method') method: string,
		@Query('postCode') postCode: string
	) {
		if (!postCode || !/^\d{6}$/.test(postCode))
			throw new BadRequestException(
				'Укажите корректный почтовый индекс (6 цифр)'
			)

		if (method === 'russian_post') {
			const price = await this.deliveryService.calculateRussianPost(postCode)
			return { price }
		}

		if (method === 'sdec') {
			const price = await this.deliveryService.calculateSdek(postCode)
			return { price }
		}

		throw new BadRequestException('Неизвестный метод доставки')
	}
}
