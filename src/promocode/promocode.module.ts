import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { PromoCodeController } from './promocode.controller'
import { PromoCodeService } from './promocode.service'

@Module({
	controllers: [PromoCodeController],
	providers: [PromoCodeService, PrismaService]
})
export class PromoCodeModule {}
