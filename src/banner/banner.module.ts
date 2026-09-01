import { Module } from '@nestjs/common'
import { WooCacheModule } from 'src/woo-proxy/woo-cache.module'
import { BannerController } from './banner.controller'
import { BannerService } from './banner.service'

@Module({
	imports: [WooCacheModule],
	controllers: [BannerController],
	providers: [BannerService]
})
export class BannerModule {}
