import { Body, Controller, Get, Post } from '@nestjs/common'
import { SearchService } from './search.service'

@Controller('search')
export class SearchController {
	constructor(private readonly searchService: SearchService) {}

	@Get('popular')
	getPopular() {
		return this.searchService.getPopular()
	}

	@Post('track')
	async track(@Body() body: { query: string }) {
		await this.searchService.track(body.query ?? '')
		return { ok: true }
	}
}
