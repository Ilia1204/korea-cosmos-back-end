import { Module } from '@nestjs/common'
import { WooCategoryController } from './woo-category.controller'
import { WooCategoryService } from './woo-category.service'
import { WooCategoryWooClient } from './woo-category-woo.client'

@Module({
	controllers: [WooCategoryController],
	providers: [WooCategoryService, WooCategoryWooClient]
})
export class WooCategoryModule {}
