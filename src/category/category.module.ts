import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { SectionService } from 'src/section/section.service'
import { CategoryController } from './category.controller'
import { CategoryService } from './category.service'

@Module({
	controllers: [CategoryController],
	providers: [CategoryService, PrismaService, SectionService]
})
export class CategoryModule {}
