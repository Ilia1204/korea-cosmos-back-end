import { Injectable } from '@nestjs/common'
import { RetailCRMSyncService } from 'src/retailcrm-sync/retailcrm-sync.service'
import { WooSyncService } from 'src/woo-sync/woo-sync.service'

@Injectable()
export class OrderWooService {
	constructor(
		private wooSync: WooSyncService,
		private retailCRM: RetailCRMSyncService
	) {}

	validateCoupon(code: string) {
		return this.wooSync.validateCoupon(code)
	}

	getOrders(email: string) {
		return this.wooSync.getOrders(email)
	}

	getOrderById(wcId: string) {
		return this.wooSync.getOrderById(wcId)
	}

	async updateOrderStatus(wcId: number, status: string) {
		await this.wooSync.updateWooOrderById(wcId, status)
		this.retailCRM.updateStatusByWcId(wcId, status).catch(() => null)
		return { success: true }
	}
}
