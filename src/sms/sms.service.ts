import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class SmsService {
	private readonly logger = new Logger(SmsService.name)
	private readonly apiId: string

	constructor(private configService: ConfigService) {
		this.apiId = this.configService.get('SMS_RU_API_ID') || ''
	}

	async initiateCallCheck(
		phone: string
	): Promise<{ checkId: string; callPhone: string } | null> {
		if (!this.apiId) {
			this.logger.warn('SMS.ru не настроен — dev-режим callcheck')
			return { checkId: 'dev-check-id', callPhone: '+7 (000) 000-00-00' }
		}

		try {
			const params = new URLSearchParams({
				api_id: this.apiId,
				phone,
				json: '1'
			})
			const res = await fetch(
				`https://sms.ru/callcheck/add?${params.toString()}`
			)
			const data = await res.json()
			if (data.status !== 'OK') {
				this.logger.error(`SMS.ru callcheck/add error: ${JSON.stringify(data)}`)
				return null
			}
			return {
				checkId: data.check_id,
				callPhone: data.call_phone_pretty || data.call_phone
			}
		} catch (e) {
			this.logger.error('SMS.ru callcheck/add failed', e)
			return null
		}
	}

	async getCallCheckStatus(
		checkId: string
	): Promise<'authorized' | 'waiting' | 'error'> {
		if (!this.apiId) return 'authorized' // dev-режим

		try {
			const params = new URLSearchParams({
				api_id: this.apiId,
				check_id: checkId,
				json: '1'
			})
			const res = await fetch(
				`https://sms.ru/callcheck/status?${params.toString()}`
			)
			const data = await res.json()
			if (data.status !== 'OK') return 'error'
			// check_status 104 = авторизован
			if (data.check_status === 104) return 'authorized'
			return 'waiting'
		} catch (e) {
			this.logger.error('SMS.ru callcheck/status failed', e)
			return 'error'
		}
	}
}
