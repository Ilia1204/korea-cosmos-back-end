import {
	IsBoolean,
	IsEmail,
	IsOptional,
	IsString,
	MinLength
} from 'class-validator'

export class AuthDto {
	@IsEmail()
	email: string

	@MinLength(8, {
		message: 'Пароль должен быть не менее 8 символов!'
	})
	@IsString()
	password: string

	@IsBoolean({})
	@IsOptional()
	isAdmin: boolean
}
