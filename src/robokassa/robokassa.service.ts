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

	private get pass3() {
		return this.isTest
			? process.env['ROBOKASSA_TEST_PASSWORD3']
			: process.env['ROBOKASSA_PASSWORD3']
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

	async getOpKey(invoiceId: number): Promise<string | null> {
		const sig = this.md5(`${this.login}:${invoiceId}:${this.pass2}`)
		const url = `https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt?MerchantLogin=${encodeURIComponent(
			this.login
		)}&InvoiceID=${invoiceId}&Signature=${sig}`

		try {
			const res = await fetch(url)
			const text = await res.text()
			const match = text.match(/<OpKey>([^<]+)<\/OpKey>/)
			if (!match) {
				this.logger.warn(`Robokassa OpStateExt: OpKey not found: ${text}`)
				return null
			}
			this.logger.log(`Robokassa OpStateExt: OpKey=${match[1]}`)
			return match[1]
		} catch (e) {
			this.logger.error(`Robokassa OpStateExt error: ${e}`)
			return null
		}
	}

	async refundByOpKey(opKey: string, amount: number): Promise<boolean> {
		const payload = { OpKey: opKey, RefundSum: Number(amount.toFixed(2)) }
		const jwt = this.signJwt(payload, this.pass3)

		try {
			const res = await fetch(
				'https://services.robokassa.ru/RefundService/Refund/Create',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: jwt
				}
			)
			const text = await res.text()
			this.logger.log(
				`Robokassa refund (v2) response status=${res.status} ${
					res.statusText
				} headers=${JSON.stringify(
					Object.fromEntries(res.headers.entries())
				)} body=${JSON.stringify(text)}`
			)
			let parsed: { success?: boolean; message?: string; requestId?: string }
			try {
				parsed = JSON.parse(text)
			} catch {
				this.logger.warn(
					`Robokassa refund (v2): non-JSON response status=${
						res.status
					} body=${JSON.stringify(text)}`
				)
				return false
			}

			if (!parsed.success) {
				this.logger.warn(`Robokassa refund (v2) failed: ${parsed.message}`)
				return false
			}

			this.logger.log(`Robokassa refund (v2) requestId=${parsed.requestId}`)
			return true
		} catch (e) {
			this.logger.error(`Robokassa refund (v2) error: ${e}`)
			return false
		}
	}

	async getRefundState(requestId: string) {
		const res = await fetch(
			`https://services.robokassa.ru/RefundService/Refund/GetState?id=${encodeURIComponent(
				requestId
			)}`
		)
		return res.json() as Promise<{
			requestId?: string
			amount?: number
			label?: string
			message?: string
		}>
	}

	async refundByInvoiceId(invoiceId: number, amount: number): Promise<boolean> {
		const opKey = await this.getOpKey(invoiceId)
		if (!opKey) return false
		return this.refundByOpKey(opKey, amount)
	}

	generateInvoiceId(): number {
		return Math.floor(Math.random() * 2_000_000_000) + 1
	}

	private md5(str: string): string {
		return crypto.createHash('md5').update(str).digest('hex')
	}

	private base64url(input: unknown): string {
		return Buffer.from(JSON.stringify(input))
			.toString('base64')
			.replace(/=/g, '')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
	}

	private signJwt(payload: Record<string, unknown>, secret: string): string {
		const header = { alg: 'HS256', typ: 'JWT' }
		const signingInput = `${this.base64url(header)}.${this.base64url(payload)}`
		const signature = crypto
			.createHmac('sha256', secret)
			.update(signingInput)
			.digest('base64')
			.replace(/=/g, '')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
		return `${signingInput}.${signature}`
	}
}
