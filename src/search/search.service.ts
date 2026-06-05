import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'

@Injectable()
export class SearchService {
	constructor(private prisma: PrismaService) {}

	async track(query: string) {
		const normalized = query.trim().toLowerCase()
		if (normalized.length < 2) return
		await this.prisma.searchQuery.upsert({
			where: { query: normalized },
			update: { count: { increment: 1 } },
			create: { query: normalized, count: 1 }
		})
	}

	async getPopular(): Promise<string[]> {
		const results = await this.prisma.searchQuery.findMany({
			orderBy: { count: 'desc' },
			take: 10,
			select: { query: true }
		})
		return results.map(r => r.query)
	}
}
