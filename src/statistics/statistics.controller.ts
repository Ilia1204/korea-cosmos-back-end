import { Controller, Get } from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { StatisticsService } from './statistics.service'

@Controller('statistics')
export class StatisticsController {
	constructor(private readonly statisticsService: StatisticsService) {}

	@Get('/registrations-by-month')
	@Auth('admin')
	getRegistrationsByMonth() {
		return this.statisticsService.getUserRegistrationsByMonth()
	}

	@Get('main')
	@Auth('admin')
	getMainStatistics() {
		return this.statisticsService.getMain()
	}

	@Get('/numbers')
	@Auth('admin')
	getNumbers() {
		return this.statisticsService.getNumbers()
	}
}
