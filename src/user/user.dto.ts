import {
	IsDateString,
	IsEmail,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	MinLength
} from 'class-validator'
import { Role } from '@prisma/client'

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
	@IsEnum(Role)
	role: Role

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
