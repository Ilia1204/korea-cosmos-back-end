import {
	Controller,
	Get,
	HttpCode,
	Param,
	Post,
	Query
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { AuditService } from './audit.service'

@Controller('audit')
export class AuditController {
	constructor(private readonly auditService: AuditService) {}

	@Get()
	@Auth('admin')
	getAll(
		@Query('page') page?: string,
		@Query('entity') entity?: string,
		@Query('action') action?: string
	) {
		return this.auditService.getAll(
			page ? Number(page) : 1,
			entity,
			action
		)
	}

	@Post(':id/revert')
	@Auth('admin')
	@HttpCode(200)
	revert(@Param('id') id: string) {
		return this.auditService.revert(id)
	}
}
