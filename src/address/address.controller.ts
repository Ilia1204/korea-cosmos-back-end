import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Post,
	Put,
	Query,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { AddressDto } from './address.dto'
import { AddressService } from './address.service'

@Controller('addresses')
@UsePipes(new ValidationPipe())
export class AddressController {
	constructor(private readonly addressService: AddressService) {}

	@Get('get-all-by-user')
	@Auth()
	getByUser(
		@CurrentUser('id') id: string,
		@Query('searchTerm') searchTerm?: string
	) {
		return this.addressService.getAllByUser(id, searchTerm)
	}

	@Get()
	getAll(@Query('searchTerm') searchTerm?: string) {
		return this.addressService.getAll(searchTerm)
	}

	@Get('default')
	@Auth()
	getDefault(@CurrentUser('id') id: string) {
		return this.addressService.getDefault(id)
	}

	@Get(':id')
	@Auth()
	getById(@Param('id') id: string) {
		return this.addressService.getById(id)
	}

	@HttpCode(200)
	@Auth()
	@Post()
	async create(@CurrentUser('id') id: string, @Body() dto: AddressDto) {
		const result = await this.addressService.create(id, dto)
		this.addressService.syncDefaultToWooCommerce(id).catch(() => null)
		return result
	}

	@HttpCode(200)
	@Auth()
	@Patch(':id/default')
	async setDefault(@Param('id') id: string, @CurrentUser('id') userId: string) {
		const result = await this.addressService.setDefault(id)
		this.addressService.syncDefaultToWooCommerce(userId).catch(() => null)
		return result
	}

	@HttpCode(200)
	@Auth()
	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() dto: AddressDto,
		@CurrentUser('id') userId: string
	) {
		const result = await this.addressService.update(id, dto)
		if (dto.isDefault)
			this.addressService.syncDefaultToWooCommerce(userId).catch(() => null)
		return result
	}

	@HttpCode(200)
	@Auth()
	@Delete('delete-by-user/:id')
	deleteByUser(@Param('id') addressId: string, @CurrentUser('id') id: string) {
		return this.addressService.deleteByUser(addressId, id)
	}

	@HttpCode(200)
	@Auth()
	@Delete('delete-all-by-user')
	deleteAll(@CurrentUser('id') id: string) {
		return this.addressService.deleteAllByUser(id)
	}

	@HttpCode(200)
	@Auth('admin')
	@Delete(':id')
	deleteByAdmin(@Param('id') id: string) {
		return this.addressService.deleteByAdmin(id)
	}
}
