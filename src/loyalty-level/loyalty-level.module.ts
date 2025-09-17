import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { LoyaltyLevelController } from './loyalty-level.controller'
import { LoyaltyLevelService } from './loyalty-level.service'
import { UserService } from 'src/user/user.service'

@Module({
	controllers: [LoyaltyLevelController],
	providers: [LoyaltyLevelService, PrismaService, UserService]
})
export class LoyaltyLevelModule {}
