import { Module } from '@nestjs/common'
import { WooCacheService } from './woo-cache.service'

@Module({
	providers: [WooCacheService],
	exports: [WooCacheService]
})
export class WooCacheModule {}
