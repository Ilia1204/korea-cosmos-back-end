import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Post,
	Put,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { PostDto } from './post.dto'
import { PostService } from './post.service'
import { returnFullestPostObject } from './return-post.object'

@Controller('posts')
export class PostController {
	constructor(private readonly postService: PostService) {}

	@Get()
	async getAll() {
		return this.postService.getPosts()
	}

	@Get('unpublished')
	@Auth('admin')
	async getUnpublished() {
		return this.postService.getPosts(false, returnFullestPostObject)
	}

	@Get('by-slug/:slug')
	async getBySlug(@Param('slug') slug: string) {
		return this.postService.getBySlug(slug)
	}

	@Get(':id')
	@Auth('admin')
	async getById(@Param('id') id: string) {
		return this.postService.getById(id)
	}

	@HttpCode(200)
	@Post()
	@Auth('admin')
	async create() {
		return this.postService.create()
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async update(@Param('id') id: string, @Body() dto: PostDto) {
		return this.postService.update(id, dto)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async delete(@Param('id') id: string) {
		return this.postService.delete(id)
	}
}
