import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class SmsService {
	private readonly logger = new Logger(SmsService.name)
	private readonly apiId: string

	constructor(private configService: ConfigService) {
		this.apiId = this.configService.get('SMS_RU_API_ID') || ''
	}

	async sendOtpCode(
		phone: string,
		code: string,
		ip?: string
	): Promise<boolean> {
		if (!this.apiId) {
			this.logger.warn(
				`SMS.ru не настроен — dev-режим, код для ${phone}: ${code}`
			)
			return true
		}

		try {
			const params = new URLSearchParams({
				api_id: this.apiId,
				to: phone,
				msg: `Код для входа: ${code}`,
				json: '1'
			})
			if (ip) params.set('ip', ip)

			const res = await fetch(`https://sms.ru/sms/send?${params.toString()}`)
			const data = await res.json()
			if (data.status !== 'OK' || data.sms?.[phone]?.status !== 'OK') {
				this.logger.error(`SMS.ru sms/send error: ${JSON.stringify(data)}`)
				return false
			}
			return true
		} catch (e) {
			this.logger.error('SMS.ru sms/send failed', e)
			return false
		}
	}
}
