import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class AddressDto {
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
	comment: string

	@IsOptional()
	@IsBoolean()
	isDefault: boolean
}
