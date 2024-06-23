import { IsString } from 'class-validator'

export class LabelProductDto {
	@IsString()
	name: string
}
