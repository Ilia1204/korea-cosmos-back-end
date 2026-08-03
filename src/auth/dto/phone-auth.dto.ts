import { IsString, Matches } from 'class-validator'

export class PhoneSendOtpDto {
	@IsString()
	@Matches(/^\+?[78]\d{9,10}$/, { message: 'Неверный формат номера телефона' })
	phone: string
}

export class PhonePollDto {
	@IsString()
	@Matches(/^\+?[78]\d{9,10}$/, { message: 'Неверный формат номера телефона' })
	phone: string
}
