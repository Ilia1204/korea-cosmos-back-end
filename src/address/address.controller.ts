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
export class AddressController {
	constructor(private readonly addressService: AddressService) {}

	@Get('get-all-by-user')
	@Auth()
	async getAllAddressesByUser(
		@CurrentUser('id') id: string,
		@Query('searchTerm') searchTerm?: string
	) {
		return this.addressService.getAllByUser(id, searchTerm)
	}

	@Get()
	async getAllAddresses(@Query('searchTerm') searchTerm?: string) {
		return this.addressService.getAll(searchTerm)
	}

	@Get('default')
	@Auth()
	async getDefaultAddress(@CurrentUser('id') id: string) {
		return this.addressService.getDefault(id)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Auth()
	@Post()
	async createAddress(@CurrentUser('id') id: string, @Body() dto: AddressDto) {
		const result = await this.addressService.create(id, dto)
		this.addressService.syncDefaultToWooCommerce(id).catch(() => null)
		return result
	}

	@HttpCode(200)
	@Auth()
	@Patch(':id/default')
	async setDefaultAddress(
		@Param('id') id: string,
		@CurrentUser('id') userId: string
	) {
		const result = await this.addressService.setDefault(id)
		this.addressService.syncDefaultToWooCommerce(userId).catch(() => null)
		return result
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth()
	async updateCategory(
		@Param('id') id: string,
		@Body() dto: AddressDto,
		@CurrentUser('id') userId: string
	) {
		const result = await this.addressService.update(id, dto)
		if (dto.isDefault) this.addressService.syncDefaultToWooCommerce(userId).catch(() => null)
		return result
	}

	@HttpCode(200)
	@Get(':id')
	@Auth()
	async getAddressById(@Param('id') id: string) {
		return this.addressService.getById(id)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Delete('delete-by-user/:id')
	@Auth()
	async deleteAddressByUser(
		@Param('id') addressId: string,
		@CurrentUser('id') id: string
	) {
		return this.addressService.deleteByUser(addressId, id)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Delete('delete-all-by-user')
	@Auth()
	async deleteAllAddressesByUser(@CurrentUser('id') id: string) {
		return this.addressService.deleteAllByUser(id)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async deleteAddressByAdmin(@Param('id') id: string) {
		return this.addressService.deleteByAdmin(id)
	}
}
