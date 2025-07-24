import { EnumBannerType } from '@prisma/client'
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator'

export class CarouselDto {
	@IsString()
	imagePath: string

	@IsOptional()
	@IsEnum(EnumBannerType)
	bannerType: EnumBannerType

	@IsString()
	bannerSlug: string

	@IsNumber()
	@IsOptional()
	order: number
}
