import { Injectable } from '@nestjs/common'
import * as crypto from 'crypto'

@Injectable()
export class RobokassaService {
	private readonly login = process.env['ROBOKASSA_LOGIN']
	private readonly isTest = process.env['ROBOKASSA_TEST'] === 'true'

	private get pass1() {
		return this.isTest
			? process.env['ROBOKASSA_TEST_PASSWORD1']
			: process.env['ROBOKASSA_PASSWORD1']
	}

	private get pass2() {
		return this.isTest
			? process.env['ROBOKASSA_TEST_PASSWORD2']
			: process.env['ROBOKASSA_PASSWORD2']
	}

	generatePaymentUrl(invoiceId: number, amount: number, description: string): string {
		const outSum = amount.toFixed(2)
		const sig = this.md5(`${this.login}:${outSum}:${invoiceId}:${this.pass1}`)

		const params = new URLSearchParams({
			MrchLogin: this.login,
			OutSum: outSum,
			InvId: String(invoiceId),
			Description: description,
			SignatureValue: sig,
			Encoding: 'utf-8',
			Culture: 'ru',
			...(this.isTest && { IsTest: '1' })
		})

		return `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`
	}

	verifyResult(outSum: string, invId: string, sig: string): boolean {
		const expected = this.md5(`${outSum}:${invId}:${this.pass2}`)
		return expected.toLowerCase() === sig.toLowerCase()
	}

	generateInvoiceId(): number {
		return Math.floor(Math.random() * 2_000_000_000) + 1
	}

	private md5(str: string): string {
		return crypto.createHash('md5').update(str).digest('hex')
	}
}
