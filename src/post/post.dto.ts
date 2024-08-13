import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator'

export class PostDto {
	@IsString()
	title: string

	@IsString()
	@IsOptional()
	description?: string

	@IsString()
	@IsOptional()
	image?: string

	@IsBoolean()
	@IsOptional()
	isPublic?: boolean

	@IsOptional()
	@IsDateString()
	createdAt: string
}

export type UpdatePostDto = Partial<PostDto>
