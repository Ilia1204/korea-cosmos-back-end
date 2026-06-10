import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DeliveryController } from './delivery.controller'
import { DeliveryService } from './delivery.service'

@Module({
	imports: [ConfigModule],
	controllers: [DeliveryController],
	providers: [DeliveryService]
})
export class DeliveryModule {}
