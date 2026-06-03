import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common'
import { WebhookService } from './webhook.service'

@Controller('webhook')
export class WebhookController {
	constructor(private readonly webhookService: WebhookService) {}

	@Post('customer-updated')
	@HttpCode(200)
	async customerUpdated(
		@Body() payload: any,
		@Headers('x-wc-webhook-secret') secret: string
	) {
		const expectedSecret = process.env.WC_WEBHOOK_SECRET
		if (expectedSecret && secret !== expectedSecret) return { ok: false }

		return this.webhookService.handleCustomerUpdated(payload)
	}

	@Post('woocommerce-order-updated')
	@HttpCode(200)
	async woocommerceOrderUpdated(
		@Body() payload: any,
		@Headers('x-wc-webhook-secret') secret: string
	) {
		const expectedSecret = process.env.WC_WEBHOOK_SECRET
		if (expectedSecret && secret !== expectedSecret) return { ok: false }

		return this.webhookService.handleWooCommerceOrderUpdated(payload)
	}

	@Post('retailcrm-order-status')
	@HttpCode(200)
	async retailCRMOrderStatus(
		@Body() payload: any,
		@Headers('x-retailcrm-secret') secret: string
	) {
		const expectedSecret = process.env.RETAILCRM_WEBHOOK_SECRET
		if (expectedSecret && secret !== expectedSecret) return { ok: false }

		return this.webhookService.handleRetailCRMOrderStatus(payload)
	}
}
