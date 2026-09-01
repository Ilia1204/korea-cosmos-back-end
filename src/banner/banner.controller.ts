import { Controller, Get } from '@nestjs/common'
import { BannerService } from './banner.service'

@Controller('banners')
export class BannerController {
	constructor(private readonly bannerService: BannerService) {}

	@Get('wp/public')
	async getPublicAll() {
		return this.bannerService.getPublicAll()
	}
}
