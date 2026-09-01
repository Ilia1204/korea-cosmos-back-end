import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { WooCacheModule } from 'src/woo-proxy/woo-cache.module'
import { PostController } from './post.controller'
import { PostService } from './post.service'
import { WpPostClient } from './wp-post.client'

@Module({
	imports: [WooCacheModule],
	controllers: [PostController],
	providers: [PostService, PrismaService, WpPostClient]
})
export class PostModule {}
