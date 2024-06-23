import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { LabelProductController } from './label-product.controller'
import { LabelProductService } from './label-product.service'

@Module({
	controllers: [LabelProductController],
	providers: [LabelProductService, PrismaService]
})
export class LabelProductModule {}
