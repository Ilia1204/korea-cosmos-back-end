import { IsString, Matches, Length } from 'class-validator'

export class PhoneSendOtpDto {
	@IsString()
	@Matches(/^\+?[78]\d{9,10}$/, { message: 'Неверный формат номера телефона' })
	phone: string
}

export class PhoneVerifyDto {
	@IsString()
	@Matches(/^\+?[78]\d{9,10}$/, { message: 'Неверный формат номера телефона' })
	phone: string

	@IsString()
	@Length(6, 6, { message: 'Код должен быть 6 символов' })
	code: string
}
