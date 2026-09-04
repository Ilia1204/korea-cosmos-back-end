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
	UploadedFile,
	UseInterceptors,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CurrentUser } from 'src/auth/decorators/user.decorator'
import { UpdateWpPostDto } from './post.dto'
import { PostService } from './post.service'

@Controller('posts')
@UsePipes(new ValidationPipe())
export class PostController {
	constructor(private readonly postService: PostService) {}

	@Get('wp/public')
	async getPublicPage(
		@Query('page') page?: string,
		@Query('perPage') perPage?: string
	) {
		return this.postService.getPublicPage(
			Number(page) || 1,
			Number(perPage) || 10
		)
	}

	@Get('wp/public/by-slug')
	async getPublicBySlug(@Query('slug') slug: string) {
		return this.postService.getPublicBySlug(slug)
	}

	@Get('wp/engagement/batch')
	async getWpEngagementBatch(@Query('slugs') slugs?: string) {
		const list = (slugs ?? '')
			.split(',')
			.map(s => s.trim())
			.filter(Boolean)
		return this.postService.getWpEngagementBatch(list)
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

	@Get('wp/admin')
	@Auth('admin')
	async getAllWpAdmin(@Query('searchTerm') searchTerm?: string) {
		return this.postService.getAllWp(searchTerm)
	}

	@Get('wp/admin/:id')
	@Auth('admin')
	async getWpAdminById(@Param('id') id: string) {
		return this.postService.getWpById(Number(id))
	}

	@HttpCode(200)
	@Post('wp/admin')
	@Auth('admin')
	async createWpAdmin(@Body() dto: UpdateWpPostDto) {
		return this.postService.createWp(dto)
	}

	@HttpCode(200)
	@Put('wp/admin/:id')
	@Auth('admin')
	async updateWpAdmin(@Param('id') id: string, @Body() dto: UpdateWpPostDto) {
		return this.postService.updateWp(Number(id), dto)
	}

	@HttpCode(200)
	@Delete('wp/admin/:id')
	@Auth('admin')
	async deleteWpAdmin(@Param('id') id: string) {
		return this.postService.deleteWp(Number(id))
	}

	@HttpCode(200)
	@Post('wp/admin/media')
	@Auth('admin')
	@UseInterceptors(FileInterceptor('file'))
	async uploadWpMedia(@UploadedFile() file: Express.Multer.File) {
		return this.postService.uploadWpMedia(file)
	}
}
