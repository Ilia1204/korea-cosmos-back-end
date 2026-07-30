import { Module } from '@nestjs/common'
import { WooSyncModule } from 'src/woo-sync/woo-sync.module'
import { WooProxyController } from './woo-proxy.controller'
import { WooProxyService } from './woo-proxy.service'

@Module({
	imports: [WooSyncModule],
	controllers: [WooProxyController],
	providers: [WooProxyService]
})
export class WooProxyModule {}
