import { Injectable } from '@nestjs/common'
import { WebhookCustomersService } from './webhook-customers.service'
import { WebhookOrdersService } from './webhook-orders.service'
import { WebhookProductsService } from './webhook-products.service'

@Injectable()
export class WebhookService {
	constructor(
		private readonly orders: WebhookOrdersService,
		private readonly products: WebhookProductsService,
		private readonly customers: WebhookCustomersService
	) {}

	handleRetailCRMOrderStatus(payload: any) {
		return this.orders.handleRetailCRMOrderStatus(payload)
	}
	handleWooCommerceOrderCreated(payload: any) {
		return this.orders.handleWooCommerceOrderCreated(payload)
	}
	handleWooCommerceOrderUpdated(payload: any) {
		return this.orders.handleWooCommerceOrderUpdated(payload)
	}
	handleProductCreated(payload: any) {
		return this.products.handleProductCreated(payload)
	}
	handleProductUpdated(payload: any) {
		return this.products.handleProductUpdated(payload)
	}
	handleCouponCreated(payload: any) {
		return this.products.handleCouponCreated(payload)
	}
	handleTermCreated(payload: any) {
		return this.products.handleTermCreated(payload)
	}
	handlePostPublished(payload: any) {
		return this.products.handlePostPublished(payload)
	}
	handleCustomerCreated(payload: any) {
		return this.customers.handleCustomerCreated(payload)
	}
	handleCustomerUpdated(payload: any) {
		return this.customers.handleCustomerUpdated(payload)
	}
}
