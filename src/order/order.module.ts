import { Module } from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { OrderController } from './order.controller'
import { OrderService } from './order.service'
import { RobokassaService } from 'src/robokassa/robokassa.service'

@Module({
	controllers: [OrderController],
	providers: [
		OrderService,
		PrismaService,
		NotificationsService,
		UserService,
		RobokassaService
	]
})
export class OrderModule {}
