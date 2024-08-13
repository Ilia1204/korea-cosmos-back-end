import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { CarouselController } from './carousel.controller'
import { CarouselService } from './carousel.service'

@Module({
	controllers: [CarouselController],
	providers: [CarouselService, PrismaService]
})
export class CarouselModule {}
