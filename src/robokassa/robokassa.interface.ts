export interface IReceiptItem {
	name: string
	quantity: number
	sum: number
	payment_method: 'full_payment'
	payment_object: 'commodity' | 'service'
	tax: 'none' | 'vat0' | 'vat10' | 'vat20'
}
