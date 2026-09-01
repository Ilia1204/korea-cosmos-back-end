import {
	IsDateString,
	IsEmail,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	MinLength,
	ValidateIf
} from 'class-validator'
import { Role } from '@prisma/client'

export class UserDto {
	// @IsOptional() пропускает только undefined/null, а не пустую строку —
	// а пустую строку шлёт фронт, когда телефонный пользователь оставляет email пустым.
	@ValidateIf(o => o.email !== undefined && o.email !== null && o.email !== '')
	@IsEmail()
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
