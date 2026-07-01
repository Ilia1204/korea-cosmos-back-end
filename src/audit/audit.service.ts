import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'

@Injectable()
export class AuditService {
	constructor(private prisma: PrismaService) {}

	async log(data: {
		action: string
		entity: string
		entityId: string
		entityName?: string
		actorId?: string
		before?: Record<string, any>
		after?: Record<string, any>
		revertible?: boolean
	}) {
		let actorEmail: string | undefined
		let actorName: string | undefined
		let actorRole: string | undefined
		if (data.actorId) {
			const actor = await this.prisma.user.findUnique({
				where: { id: data.actorId },
				select: { email: true, name: true, surname: true, role: true }
			})
			actorEmail = actor?.email
			actorRole = actor?.role
			const parts = [actor?.name, actor?.surname].filter(Boolean)
			actorName = parts.length > 0 ? parts.join(' ') : actorEmail
		}

		return this.prisma.auditLog.create({
			data: {
				action: data.action,
				entity: data.entity,
				entityId: data.entityId,
				entityName: data.entityName,
				actorId: data.actorId,
				actorEmail,
				actorName,
				actorRole,
				before: (data.before as any) ?? undefined,
				after: (data.after as any) ?? undefined,
				revertible: data.revertible ?? false
			}
		})
	}

	async getAll(page = 1, entity?: string, action?: string) {
		const limit = 50
		const skip = (page - 1) * limit
		const where: any = {}
		if (entity) where.entity = entity
		if (action) where.action = action

		const [logs, total] = await Promise.all([
			this.prisma.auditLog.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip,
				take: limit
			}),
			this.prisma.auditLog.count({ where })
		])

		return { logs, page, hasMore: skip + logs.length < total, total }
	}

	async revert(id: string) {
		const log = await this.prisma.auditLog.findUnique({ where: { id } })
		if (!log) throw new NotFoundException('Запись не найдена')
		if (!log.revertible) throw new BadRequestException('Это действие нельзя откатить')
		if (log.revertedAt) throw new BadRequestException('Изменение уже откатили')
		if (!log.before) throw new BadRequestException('Нет данных для отката')

		if (log.entity === 'Product') {
			await this.prisma.product.update({
				where: { id: log.entityId },
				data: log.before as any
			})
		} else {
			throw new BadRequestException('Откат для этого типа не поддерживается')
		}

		return this.prisma.auditLog.update({
			where: { id },
			data: { revertedAt: new Date() }
		})
	}
}
