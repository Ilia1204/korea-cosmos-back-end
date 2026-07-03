import { Module } from '@nestjs/common'
import { WooCouponController } from './woo-coupon.controller'
import { WooCouponService } from './woo-coupon.service'
import { WooCouponWooClient } from './woo-coupon-woo.client'

@Module({
	controllers: [WooCouponController],
	providers: [WooCouponService, WooCouponWooClient]
})
export class WooCouponModule {}
