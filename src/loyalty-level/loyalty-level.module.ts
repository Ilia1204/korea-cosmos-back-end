import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { LoyaltyLevelController } from './loyalty-level.controller'
import { LoyaltyLevelService } from './loyalty-level.service'

@Module({
	imports: [NotificationsModule, ConfigModule],
	controllers: [LoyaltyLevelController],
	providers: [LoyaltyLevelService, PrismaService],
	exports: [LoyaltyLevelService]
})
export class LoyaltyLevelModule {}
