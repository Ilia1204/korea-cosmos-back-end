import { Controller, Get, Header } from '@nestjs/common'
import { DELETE_ACCOUNT_PAGE_HTML } from './delete-account.page'

@Controller('legal')
export class LegalController {
	@Get('delete-account')
	@Header('Content-Type', 'text/html; charset=utf-8')
	getDeleteAccountPage() {
		return DELETE_ACCOUNT_PAGE_HTML
	}
}
