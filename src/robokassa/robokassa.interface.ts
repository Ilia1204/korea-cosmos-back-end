export interface IReceiptItem {
	name: string
	quantity: number
	sum: number
	payment_method: 'full_payment'
	payment_object: 'commodity' | 'service'
	tax: 'none' | 'vat0' | 'vat10' | 'vat20'
}

export interface IReceipt {
	sno: 'usn_income'
	items: IReceiptItem[]
	email?: string
	phone?: string
}

export interface IRefundInvoiceItem {
	Name: string
	Quantity: number
	Cost: number
	Tax: IReceiptItem['tax']
	PaymentMethod: IReceiptItem['payment_method']
	PaymentObject: IReceiptItem['payment_object']
}
