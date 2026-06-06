import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ServeStaticModule } from '@nestjs/serve-static'
import { path } from 'app-root-path'
import { AddressModule } from './address/address.module'
import { AuthModule } from './auth/auth.module'
import { CategoryModule } from './category/category.module'
import { EmailModule } from './email/email.module'
import { FileModule } from './file/file.module'
import { LabelProductModule } from './label-product/label-product.module'
import { NotificationsModule } from './notifications/notifications.module'
import { OrderModule } from './order/order.module'
import { PostModule } from './post/post.module'
import { ProductModule } from './product/product.module'
import { PromoCodeModule } from './promocode/promocode.module'
import { ReviewModule } from './review/review.module'
import { SectionModule } from './section/section.module'
import { StatisticsModule } from './statistics/statistics.module'
import { UserModule } from './user/user.module'
import { LoyaltyLevelModule } from './loyalty-level/loyalty-level.module'
import { WooReviewModule } from './woo-review/woo-review.module'
import { CartModule } from './cart/cart.module'
import { WebhookModule } from './webhook/webhook.module'
import { DeliveryModule } from './delivery/delivery.module'
import { RobokassaModule } from './robokassa/robokassa.module'
import { RetailCRMSyncModule } from './retailcrm-sync/retailcrm-sync.module'
import { WooSyncModule } from './woo-sync/woo-sync.module'
import { SearchModule } from './search/search.module'

@Module({
	imports: [
		ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }]),
		ScheduleModule.forRoot(),
		ServeStaticModule.forRoot({
			rootPath: `${path}/uploads`,
			serveRoot: '/uploads'
		}),
		ConfigModule.forRoot(),
		AuthModule,
		UserModule,
		ProductModule,
		PostModule,
		ReviewModule,
		SectionModule,
		CategoryModule,
		OrderModule,
		StatisticsModule,
		LabelProductModule,
		FileModule,
		EmailModule,
		PromoCodeModule,
		NotificationsModule,
		AddressModule,
		LoyaltyLevelModule,
		WooReviewModule,
		CartModule,
		WebhookModule,
		DeliveryModule,
		RobokassaModule,
		RetailCRMSyncModule,
		WooSyncModule,
		SearchModule
	],
	providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
})
export class AppModule {}
