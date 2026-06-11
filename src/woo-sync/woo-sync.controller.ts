import { Controller, Get } from '@nestjs/common'
import { WooSyncService } from './woo-sync.service'

@Controller('woo')
export class WooSyncController {
	constructor(private readonly wooSyncService: WooSyncService) {}

	@Get('label-products')
	getLabelProducts() {
		return this.wooSyncService.getLabelProducts()
	}
}
