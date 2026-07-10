import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PrismaService } from 'src/prisma.service'
import { getJwtConfig } from 'src/config/jwt.config'
import { ChatController } from './chat.controller'
import { ChatGateway } from './chat.gateway'
import { ChatService } from './chat.service'
import { FileService } from 'src/file/file.service'
import { NotificationsModule } from 'src/notifications/notifications.module'

@Module({
	imports: [
		ConfigModule,
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: getJwtConfig
		}),
		NotificationsModule
	],
	controllers: [ChatController],
	providers: [ChatGateway, ChatService, PrismaService, FileService]
})
export class ChatModule {}
