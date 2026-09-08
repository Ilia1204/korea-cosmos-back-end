import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { AuditService } from 'src/audit/audit.service'
import { RetailCrmService } from 'src/statistics/retail-crm.service'
import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
	imports: [ConfigModule],
	controllers: [UserController],
	providers: [
		UserService,
		PrismaService,
		NotificationsService,
		AuditService,
		RetailCrmService
	],
	exports: [UserService]
})
export class UserModule {}
