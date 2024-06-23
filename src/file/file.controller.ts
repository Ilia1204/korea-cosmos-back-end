import {
	BadRequestException,
	Controller,
	HttpCode,
	Post,
	Query,
	UploadedFiles,
	UseInterceptors
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express/multer/interceptors/files.interceptor'
import { IFileResponseData } from './file.interface'
import { FileService } from './file.service'

@Controller('files')
export class FileController {
	constructor(private readonly fileService: FileService) {}

	@Post()
	@HttpCode(200)
	@UseInterceptors(
		FilesInterceptor('file', 5, {
			limits: {
				files: 5
			}
		})
	)
	async saveFiles(
		@UploadedFiles() files: Express.Multer.File[],
		@Query('folder') folder?: string
	): Promise<IFileResponseData> {
		if (!files.length)
			throw new BadRequestException('Пожалуйста, загрузите файлы')

		return await this.fileService.saveFiles(files, folder)
	}
}
