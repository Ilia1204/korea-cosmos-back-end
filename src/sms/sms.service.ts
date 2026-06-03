import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class SmsService {
	private readonly logger = new Logger(SmsService.name)
	private readonly login: string
	private readonly password: string

	constructor(private configService: ConfigService) {
		this.login = this.configService.get('SMSC_LOGIN') || ''
		this.password = this.configService.get('SMSC_PASSWORD') || ''
	}

	async sendSms(phone: string, message: string): Promise<boolean> {
		if (!this.login || !this.password) {
			this.logger.warn(`SMSC не настроен — SMS не отправлен. Код: ${message}`)
			return true // dev-режим
		}

		try {
			const params = new URLSearchParams({
				login: this.login,
				psw: this.password,
				phones: phone,
				mes: message,
				fmt: '3',
				charset: 'utf-8',
				sender: 'num'
			})
			const res = await fetch(
				`https://smsc.ru/sys/send.php?${params.toString()}`
			)
			const data = await res.json()
			if (data.error_code) {
				this.logger.error(`SMSC error ${data.error_code}: ${data.error}`)
				return false
			}
			return true
		} catch (e) {
			this.logger.error('SMSC send failed', e)
			return false
		}
	}
}
