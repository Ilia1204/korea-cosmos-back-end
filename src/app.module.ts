import { MailerModule } from '@nestjs-modules/mailer'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ServeStaticModule } from '@nestjs/serve-static'
import { path } from 'app-root-path'
import { AddressModule } from './address/address.module'
import { AuthModule } from './auth/auth.module'
import { CarouselModule } from './carousel/carousel.module'
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
		ScheduleModule.forRoot(),
		ServeStaticModule.forRoot({
			rootPath: `${path}/uploads`,
			serveRoot: '/uploads'
		}),
		MailerModule.forRoot({
			transport: {
				host: process.env.EMAIL_HOST || 'sandbox.smtp.mailtrap.io',
				port: parseInt(process.env.EMAIL_PORT || '2525'),
				auth: {
					user: process.env.EMAIL_USERNAME,
					pass: process.env.EMAIL_PASSWORD
				}
			}
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
		CarouselModule,
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
	]
})
export class AppModule {}
