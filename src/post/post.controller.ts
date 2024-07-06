import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Post,
	Put,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { UpdatePostDto } from './post.dto'
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

	@HttpCode(200)
	@Auth()
	@Patch('toggle-like/:id')
	async toggleLike(@Param('id') id: string, @CurrentUser('id') userId: string) {
		return this.postService.toggleFavorite(id, userId)
	}

	@UsePipes(new ValidationPipe())
	@Put('update-count-views')
	@HttpCode(200)
	async updateCountViews(@Body('slug') slug: string) {
		return this.postService.updateCountViews(slug)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put(':id')
	@Auth('admin')
	async update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
		return this.postService.update(id, dto)
	}

	@HttpCode(200)
	@Delete(':id')
	@Auth('admin')
	async delete(@Param('id') id: string) {
		return this.postService.delete(id)
	}
}
