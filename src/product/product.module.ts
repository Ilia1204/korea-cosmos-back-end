import { Module } from '@nestjs/common'
import { CategoryModule } from 'src/category/category.module'
import { CategoryService } from 'src/category/category.service'
import { LabelProductService } from 'src/label-product/label-product.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PaginationModule } from 'src/pagination/pagination.module'
import { PaginationService } from 'src/pagination/pagination.service'
import { PrismaService } from 'src/prisma.service'
import { SectionService } from 'src/section/section.service'
import { UserService } from 'src/user/user.service'
import { AuditService } from 'src/audit/audit.service'
import { ProductController } from './product.controller'
import { ProductService } from './product.service'

@Module({
	controllers: [ProductController],
	imports: [PaginationModule, CategoryModule],
	providers: [
		ProductService,
		PrismaService,
		CategoryService,
		SectionService,
		LabelProductService,
		PaginationService,
		NotificationsService,
		UserService,
		AuditService
	]
})
export class ProductModule {}
