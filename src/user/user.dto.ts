import {
	IsBoolean,
	IsDateString,
	IsEmail,
	IsNumber,
	IsOptional,
	IsString,
	MinLength
} from 'class-validator'

export class UserDto {
	@IsEmail()
	@IsOptional()
	email: string

	@IsOptional()
	@IsString()
	phone: string

	@IsOptional()
	@IsString()
	name: string

	@IsOptional()
	@IsString()
	displayName: string

	@IsOptional()
	@MinLength(8, {
		message: 'Пароль должен быть не менее 8 символов!'
	})
	@IsString()
	password: string

	@IsOptional()
	@IsBoolean()
	isAdmin: boolean

	@IsOptional()
	@IsString()
	surname: string

	@IsOptional()
	@IsString()
	avatarPath: string

	@IsOptional()
	@IsDateString()
	dateOfBirth?: string

	@IsOptional()
	@IsNumber()
	resetPasswordCount: number
}
