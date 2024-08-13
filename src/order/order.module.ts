import { Module } from '@nestjs/common'
import { LabelProductService } from 'src/label-product/label-product.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { ProductService } from 'src/product/product.service'
import { UserService } from 'src/user/user.service'
import { OrderController } from './order.controller'
import { OrderService } from './order.service'
import { PaginationService } from 'src/pagination/pagination.service'

@Module({
	controllers: [OrderController],
	providers: [
		OrderService,
		PrismaService,
		NotificationsService,
		UserService,
		ProductService,
		LabelProductService,
		PaginationService
	]
})
export class OrderModule {}
