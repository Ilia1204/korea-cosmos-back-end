import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ServeStaticModule } from '@nestjs/serve-static'
import { path } from 'app-root-path'
import { AuthModule } from './auth/auth.module'
import { CategoryModule } from './category/category.module'
import { FileModule } from './file/file.module'
import { LabelProductModule } from './label-product/label-product.module'
import { OrderModule } from './order/order.module'
import { PostModule } from './post/post.module'
import { ProductModule } from './product/product.module'
import { ReviewModule } from './review/review.module'
import { SectionModule } from './section/section.module'
import { StatisticsModule } from './statistics/statistics.module'
import { UserModule } from './user/user.module'

@Module({
	imports: [
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
		FileModule
	]
})
export class AppModule {}
