import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common'
import { WebhookService } from './webhook.service'

@Controller('webhook')
export class WebhookController {
	constructor(private readonly webhookService: WebhookService) {}

	@Post('product-created')
	@HttpCode(200)
	async productCreated(
		@Body() payload: any,
		@Headers('x-wc-webhook-secret') secret: string
	) {
		const expectedSecret = process.env.WC_WEBHOOK_SECRET
		if (expectedSecret && secret !== expectedSecret) return { ok: false }
		return this.webhookService.handleProductCreated(payload)
	}

	@Post('product-updated')
	@HttpCode(200)
	async productUpdated(
		@Body() payload: any,
		@Headers('x-wc-webhook-secret') secret: string
	) {
		const expectedSecret = process.env.WC_WEBHOOK_SECRET
		if (expectedSecret && secret !== expectedSecret) return { ok: false }
		return this.webhookService.handleProductUpdated(payload)
	}

	@Post('post-published')
	@HttpCode(200)
	async postPublished(
		@Body() payload: any,
		@Headers('x-kc-secret') secret: string
	) {
		const expectedSecret = process.env.KC_APP_SECRET
		if (expectedSecret && secret !== expectedSecret) return { ok: false }
		return this.webhookService.handlePostPublished(payload)
	}

	@Post('term-created')
	@HttpCode(200)
	async termCreated(
		@Body() payload: any,
		@Headers('x-kc-secret') secret: string
	) {
		const expectedSecret = process.env.KC_APP_SECRET
		if (expectedSecret && secret !== expectedSecret) return { ok: false }
		return this.webhookService.handleTermCreated(payload)
	}

	@Post('coupon-created')
	@HttpCode(200)
	async couponCreated(
		@Body() payload: any,
		@Headers('x-wc-webhook-secret') secret: string
	) {
		const expectedSecret = process.env.WC_WEBHOOK_SECRET
		if (expectedSecret && secret !== expectedSecret) return { ok: false }
		return this.webhookService.handleCouponCreated(payload)
	}

	@Post('customer-created')
	@HttpCode(200)
	async customerCreated(
		@Body() payload: any,
		@Headers('x-wc-webhook-secret') secret: string
	) {
		const expectedSecret = process.env.WC_WEBHOOK_SECRET
		if (expectedSecret && secret !== expectedSecret) return { ok: false }
		return this.webhookService.handleCustomerCreated(payload)
	}

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

	@Post('woocommerce-order-created')
	@HttpCode(200)
	async woocommerceOrderCreated(
		@Body() payload: any,
		@Headers('x-wc-webhook-secret') secret: string
	) {
		const expectedSecret = process.env.WC_WEBHOOK_SECRET
		if (expectedSecret && secret !== expectedSecret) return { ok: false }
		return this.webhookService.handleWooCommerceOrderCreated(payload)
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
