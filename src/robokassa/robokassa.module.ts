import { Module } from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { RobokassaController } from './robokassa.controller'
import { RobokassaService } from './robokassa.service'

@Module({
	controllers: [RobokassaController],
	providers: [RobokassaService, PrismaService, NotificationsService, UserService],
	exports: [RobokassaService]
})
export class RobokassaModule {}
