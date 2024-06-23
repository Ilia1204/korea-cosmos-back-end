import { BadRequestException, Injectable } from '@nestjs/common'
import * as fs from 'fs'
import { ensureDir } from 'fs-extra'
import * as path from 'path'
import { IFileResponse, allowedFolders } from './file.interface'

@Injectable()
export class FileService {
	private fileIdCounter: number = 0

	async saveFiles(
		files: Express.Multer.File[],
		folder: string = 'default'
	): Promise<{ status: string; message: string; data: IFileResponse[] }> {
		if (!allowedFolders.includes(folder))
			throw new BadRequestException('Такой папки не существует')

		if (files.length > 5)
			throw new BadRequestException('Вы можете загрузить только 5 файлов')

		await Promise.all(files.map(file => this.checkFileType(file)))

		const response = {
			status: 'успешно',
			message:
				files.length === 1
					? 'Файл успешно загружен'
					: 'Файлы успешно загружены',
			data: []
		}

		const uploadFolder = path.join(path.resolve(), 'uploads', folder)
		await ensureDir(uploadFolder)

		const data: IFileResponse[] = await Promise.all(
			files.map(async file => {
				const { originalname, buffer, size } = file
				const name = `${
					originalname.split('.')[0]
				}-korea-cosmos-${Date.now()}${path.extname(originalname)}`
					.toLowerCase()
					.replace(/_/g, '-')
					.replace(/ /g, '-')

				const imagePath = path.join(uploadFolder, name)
				fs.writeFileSync(imagePath, buffer)

				const filePath = `/uploads/${folder}/${name}`

				return {
					_id: ++this.fileIdCounter,
					path: filePath,
					name,
					size: this.formatBytes(size)
				}
			})
		)
		response.data = data

		return response
	}

	formatBytes(bytes: number, decimal = 2): string {
		if (!bytes) return '0 Bytes'

		const k = 1024
		const dm = decimal < 0 ? 0 : decimal
		const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

		const i = Math.floor(Math.log(bytes) / Math.log(k))
		return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
	}

	async checkFileType(file: Express.Multer.File): Promise<void> {
		const filetypes = /jpeg|jpg|png|svg+xml|svg|webp|pjpeg/
		const extname = filetypes.test(
			path.extname(file.originalname).toLowerCase()
		)
		const mimetype = filetypes.test(file.mimetype)

		if (!extname && !mimetype)
			throw new BadRequestException('Вы можете загрузить только картинки')
	}
}
