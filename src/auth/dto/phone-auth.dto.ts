import { IsString, Matches } from 'class-validator'

export class PhoneDto {
	@IsString()
	@Matches(/^\+?[78]\d{9,10}$/, { message: 'Неверный формат номера телефона' })
	phone: string
}

export class VerifyPhoneOtpDto extends PhoneDto {
	@IsString()
	@Matches(/^\d{4}$/, { message: 'Неверный формат кода' })
	code: string
}
