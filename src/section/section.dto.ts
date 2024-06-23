import { IsString } from 'class-validator'

export class SectionDto {
	@IsString()
	name: string
}
