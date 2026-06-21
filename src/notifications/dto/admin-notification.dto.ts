import { IsDateString, IsIn, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'

export type BroadcastSegment = 'all' | 'active' | 'inactive' | 'new_users' | 'category'

export class AdminBroadcastDto {
	@IsString()
	title: string

	@IsString()
	body: string

	@IsOptional()
	@IsObject()
	data?: { screen?: string; params?: Record<string, any> }

	@IsOptional()
	@IsIn(['all', 'active', 'inactive', 'new_users', 'category'])
	segment?: BroadcastSegment

	@IsOptional()
	@IsString()
	categorySlug?: string

	@IsOptional()
	@IsNumber()
	@Min(1)
	@Type(() => Number)
	frequencyDays?: number
}

export class ScheduleBroadcastDto {
	@IsString()
	title: string

	@IsString()
	body: string

	@IsDateString()
	scheduledAt: string

	@IsOptional()
	@IsIn(['all', 'active', 'inactive', 'new_users', 'category'])
	segment?: BroadcastSegment

	@IsOptional()
	@IsString()
	categorySlug?: string

	@IsOptional()
	@IsNumber()
	@Min(1)
	@Type(() => Number)
	frequencyDays?: number

	@IsOptional()
	@IsObject()
	data?: object
}
