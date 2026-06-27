import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaService } from 'src/prisma.service'
import { CdekTrackingService } from './cdek-tracking.service'
import { RussianPostTrackingService } from './russian-post-tracking.service'
import { DeliveryController } from './delivery.controller'
import { DeliveryService } from './delivery.service'

@Module({
	imports: [ConfigModule],
	controllers: [DeliveryController],
	providers: [DeliveryService, CdekTrackingService, RussianPostTrackingService, PrismaService],
	exports: [DeliveryService]
})
export class DeliveryModule {}
