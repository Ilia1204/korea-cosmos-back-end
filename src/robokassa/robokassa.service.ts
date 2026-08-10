import { Injectable, Logger } from '@nestjs/common'
import * as crypto from 'crypto'
import { IReceipt, IReceiptItem } from './robokassa.interface'

@Injectable()
export class RobokassaService {
	private readonly logger = new Logger(RobokassaService.name)
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

	generatePaymentUrl(
		invoiceId: number,
		amount: number,
		description: string,
		receiptItems: IReceiptItem[],
		incCurrLabel?: string,
		email?: string,
		phone?: string
	): string {
		const outSum = amount.toFixed(2)
		const receiptData: IReceipt = { sno: 'usn_income', items: receiptItems }
		if (email) receiptData.email = email
		else if (phone) receiptData.phone = phone
		const receipt = JSON.stringify(receiptData)
		const backendUrl =
			process.env['APP_URL'] || 'https://korea-cosmos-back-xferpsixo.amvera.io'

		const sig = this.md5(
			`${this.login}:${outSum}:${invoiceId}:${receipt}:${this.pass1}`
		)

		const params = new URLSearchParams({
			MrchLogin: this.login,
			OutSum: outSum,
			InvId: String(invoiceId),
			Description: description,
			Receipt: receipt,
			SignatureValue: sig,
			Encoding: 'utf-8',
			Culture: 'ru',
			SuccessUrl: `${backendUrl}/robokassa/success`,
			FailUrl: `${backendUrl}/robokassa/fail`,
			...(this.isTest && { IsTest: '1' }),
			...(incCurrLabel && { IncCurrLabel: incCurrLabel }),
			...(email && { Email: email })
		})

		return `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`
	}

	verifyResult(outSum: string, invId: string, sig: string): boolean {
		const expected = this.md5(`${outSum}:${invId}:${this.pass2}`)
		return expected.toLowerCase() === sig.toLowerCase()
	}

	async refund(invoiceId: number, amount: number): Promise<boolean> {
		const outSum = amount.toFixed(2)
		const sig = this.md5(`${this.login}:${outSum}:${invoiceId}:${this.pass2}`)

		const params = new URLSearchParams({
			MrchLogin: this.login,
			InvId: String(invoiceId),
			OutSum: outSum,
			SignatureValue: sig,
			...(this.isTest && { IsTest: '1' })
		})

		try {
			const res = await fetch(
				`https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpReturn?${params.toString()}`
			)
			const text = await res.text()
			const ok = text.includes('<Result>0</Result>')
			if (!ok) this.logger.warn(`Robokassa refund failed: ${text}`)
			return ok
		} catch (e) {
			this.logger.error(`Robokassa refund error: ${e}`)
			return false
		}
	}

	generateInvoiceId(): number {
		return Math.floor(Math.random() * 2_000_000_000) + 1
	}

	private md5(str: string): string {
		return crypto.createHash('md5').update(str).digest('hex')
	}
}
