import {
	IsBoolean,
	IsEmail,
	IsNumber,
	IsOptional,
	IsString,
	MinLength
} from 'class-validator'

export class ShippingInfoDto {
	@IsOptional()
	@IsString()
	region: string

	@IsOptional()
	@IsString()
	city: string

	@IsOptional()
	@IsString()
	postCode: string

	@IsOptional()
	@IsString()
	street: string

	@IsOptional()
	@IsString()
	house: string

	@IsOptional()
	@IsString()
	apartment: string

	@IsOptional()
	@IsString()
	phone: string
}

export class UserDto extends ShippingInfoDto {
	@IsEmail()
	@IsOptional()
	email: string

	@IsOptional()
	@IsString()
	name: string

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
	@IsNumber()
	resetPasswordCount: number
}
