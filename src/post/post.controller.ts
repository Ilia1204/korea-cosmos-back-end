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
	Query,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { UpdatePostDto } from './post.dto'
import { PostService } from './post.service'

@Controller('posts')
export class PostController {
	constructor(private readonly postService: PostService) {}

	@Get('published')
	async getPublishedPosts() {
		return this.postService.getPublishedPosts()
	}

	@Get('wp/:slug/engagement')
	async getWpEngagement(@Param('slug') slug: string) {
		return this.postService.getWpEngagement(slug)
	}

	@HttpCode(200)
	@Put('wp/:slug/views')
	async incrementWpViews(@Param('slug') slug: string) {
		return this.postService.incrementWpViews(slug)
	}

	@HttpCode(200)
	@Auth()
	@Patch('wp/:slug/like')
	async toggleWpLike(
		@Param('slug') slug: string,
		@CurrentUser('id') userId: string
	) {
		return this.postService.toggleWpLike(slug, userId)
	}

	@Get()
	@Auth('admin')
	async getAllPosts(@Query('searchTerm') searchTerm?: string) {
		return this.postService.getAllPosts(searchTerm)
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
