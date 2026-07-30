import {
	Body,
	Controller,
	Get,
	Param,
	ParseIntPipe,
	Patch,
	Query
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { WooProductAdminService } from './woo-product-admin.service'
import { WooSyncService } from './woo-sync.service'
import { WcProductQueryDto } from './dto/wc-product-dto'
import { WcProductUpdateDto } from './dto/wc-product-update.dto'

@Controller('woo')
export class WooSyncController {
	constructor(
		private readonly wooSyncService: WooSyncService,
		private readonly wooProductAdmin: WooProductAdminService
	) {}

	@Get('label-products')
	getLabelProducts() {
		return this.wooSyncService.getLabelProducts()
	}

	@Get('admin/products/categories')
	@Auth('manager')
	getWcCategories() {
		return this.wooProductAdmin.getWcCategories()
	}

	@Get('admin/products/tags')
	@Auth('manager')
	getWcTags() {
		return this.wooProductAdmin.getWcTags()
	}

	@Get('admin/products')
	@Auth('manager')
	getProducts(@Query() query: WcProductQueryDto) {
		return this.wooProductAdmin.getProducts(query)
	}

	@Get('admin/products/:id')
	@Auth('manager')
	getProduct(@Param('id', ParseIntPipe) id: number) {
		return this.wooProductAdmin.getProduct(id)
	}

	@Patch('admin/products/:id')
	@Auth('manager')
	updateProduct(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: WcProductUpdateDto
	) {
		return this.wooProductAdmin.updateProduct(id, dto)
	}
}
