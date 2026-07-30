import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Put,
	Query,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { AuditService } from 'src/audit/audit.service'
import { UserDto } from './user.dto'
import { UserService } from './user.service'

@Controller('users')
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly auditService: AuditService
	) {}

	@HttpCode(200)
	@Auth()
	@Patch('profile/favorites/:productId')
	async toggleFavorite(
		@CurrentUser('id') id: string,
		@Param('productId') productId: string
	) {
		return this.userService.toggleFavorite(id, productId)
	}

	@HttpCode(200)
	@Auth()
	@Delete('profile/favorites')
	async clearFavorites(@CurrentUser('id') id: string) {
		return this.userService.clearFavorites(id)
	}

	@Get('profile')
	@Auth()
	async getProfile(@CurrentUser('id') id: string) {
		const user = await this.userService.getById(id)
		// Синхронизируем данные с WooCommerce в фоне (WP → App)
		this.userService.syncProfileFromWordPress(id, user.email).catch(() => null)
		return user
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put('profile')
	@Auth()
	async updateProfile(@CurrentUser('id') id: string, @Body() dto: UserDto) {
		const user = await this.userService.getById(id)
		const updated = await this.userService.update(id, dto)
		// Синхронизируем изменения в WooCommerce в фоне (App → WP)
		this.userService.syncProfileToWordPress(user.email, dto).catch(() => null)
		return updated
	}

	@Get()
	@Auth('manager')
	async getAll(@Query('searchTerm') searchTerm?: string) {
		return this.userService.getAll(searchTerm)
	}

	@Get('admin-list')
	@Auth('manager')
	async getAdminList(
		@Query('search') search?: string,
		@Query('page') page?: string,
		@Query('role') role?: string,
		@Query('hasOrders') hasOrders?: string
	) {
		return this.userService.getAdminUsers(search, page ? Number(page) : 1, role, hasOrders)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async updateUser(
		@Param('id') id: string,
		@Body() dto: UserDto,
		@CurrentUser('id') actorId: string
	) {
		const before = await this.userService.getById(id)
		const updated = await this.userService.update(id, dto)

		if (before && (dto as any).role && (dto as any).role !== before.role) {
			this.auditService.log({
				action: 'user.role',
				entity: 'User',
				entityId: id,
				entityName: before.email,
				actorId,
				before: { role: before.role },
				after: { role: (dto as any).role },
				revertible: false
			}).catch(() => null)
		}

		return updated
	}

	@Get('by-email/:email')
	@Auth('manager')
	async getByEmail(@Param('email') email: string) {
		return this.userService.getByEmail(email)
	}

	@Get(':id')
	@Auth('manager')
	async getById(@Param('id') id: string) {
		return this.userService.getById(id)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async deleteUser(@Param('id') id: string) {
		return this.userService.delete(id)
	}
}
