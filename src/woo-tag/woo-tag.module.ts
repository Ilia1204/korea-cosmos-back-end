import { Module } from '@nestjs/common'
import { WooTagController } from './woo-tag.controller'
import { WooTagService } from './woo-tag.service'
import { WooTagWooClient } from './woo-tag-woo.client'

@Module({
	controllers: [WooTagController],
	providers: [WooTagService, WooTagWooClient]
})
export class WooTagModule {}
