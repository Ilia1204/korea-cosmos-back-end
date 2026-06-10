import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaService } from 'src/prisma.service'
import { StatisticsController } from './statistics.controller'
import { StatisticsService } from './statistics.service'

@Module({
	imports: [ConfigModule],
	controllers: [StatisticsController],
	providers: [StatisticsService, PrismaService]
})
export class StatisticsModule {}
