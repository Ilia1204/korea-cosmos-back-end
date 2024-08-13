import { Module } from '@nestjs/common'
import { CategoryService } from 'src/category/category.service'
import { LabelProductService } from 'src/label-product/label-product.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PaginationService } from 'src/pagination/pagination.service'
import { PrismaService } from 'src/prisma.service'
import { ProductService } from 'src/product/product.service'
import { SectionService } from 'src/section/section.service'
import { UserService } from 'src/user/user.service'
import { ReviewController } from './review.controller'
import { ReviewService } from './review.service'

@Module({
	controllers: [ReviewController],
	providers: [
		ReviewService,
		PrismaService,
		ProductService,
		SectionService,
		CategoryService,
		LabelProductService,
		PaginationService,
		UserService,
		NotificationsService
	]
})
export class ReviewModule {}
