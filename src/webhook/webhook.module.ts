import { Module } from '@nestjs/common'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PrismaService } from 'src/prisma.service'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'

@Module({
	imports: [NotificationsModule],
	controllers: [WebhookController],
	providers: [WebhookService, PrismaService]
})
export class WebhookModule {}
