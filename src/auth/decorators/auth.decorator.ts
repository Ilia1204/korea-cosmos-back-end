import { applyDecorators, UseGuards } from '@nestjs/common'
import { TypeRole } from '../auth.interface'
import { ManagerOrAdminGuard, OnlyAdminGuard } from '../guards/admin.guard'
import { JwtAuthGuard } from '../guards/jwt.guard'

export const Auth = (role: TypeRole = 'user') =>
	applyDecorators(
		role === 'admin'
			? UseGuards(JwtAuthGuard, OnlyAdminGuard)
			: role === 'manager'
				? UseGuards(JwtAuthGuard, ManagerOrAdminGuard)
				: UseGuards(JwtAuthGuard)
	)
