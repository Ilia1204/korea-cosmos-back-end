import { IsString, Matches } from 'class-validator'

export class PhoneDto {
	@IsString()
	@Matches(/^\+?[78]\d{9,10}$/, { message: 'Неверный формат номера телефона' })
	phone: string
}
