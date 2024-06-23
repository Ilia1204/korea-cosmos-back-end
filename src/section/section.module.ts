import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { SectionController } from './section.controller'
import { SectionService } from './section.service'

@Module({
	controllers: [SectionController],
	providers: [SectionService, PrismaService]
})
export class SectionModule {}
