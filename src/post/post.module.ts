import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { PostController } from './post.controller'
import { PostService } from './post.service'
import { WpPostClient } from './wp-post.client'

@Module({
	controllers: [PostController],
	providers: [PostService, PrismaService, WpPostClient]
})
export class PostModule {}
