import { IsIn, IsInt, IsOptional, IsString } from 'class-validator'

export class UpdateWpPostDto {
	@IsString()
	@IsOptional()
	title?: string

	@IsString()
	@IsOptional()
	description?: string

	@IsString()
	@IsOptional()
	slug?: string

	@IsIn(['publish', 'draft', 'future', 'pending', 'private'])
	@IsOptional()
	status?: string

	@IsOptional()
	@IsString()
	date?: string

	@IsInt()
	@IsOptional()
	featuredMediaId?: number
}
