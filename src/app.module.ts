import { MailerModule } from '@nestjs-modules/mailer'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ServeStaticModule } from '@nestjs/serve-static'
import { path } from 'app-root-path'
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
import { AddressModule } from './address/address.module';

@Module({
	imports: [
		ScheduleModule.forRoot(),
		ServeStaticModule.forRoot({
			rootPath: `${path}/uploads`,
			serveRoot: '/uploads'
		}),
		MailerModule.forRoot({
			transport: {
				host: 'sandbox.smtp.mailtrap.io',
				port: 2525,
				auth: {
					user: '05e6fa309d1f90',
					pass: 'cf0dc8881bf090'
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
		AddressModule
	]
})
export class AppModule {}
