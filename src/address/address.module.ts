import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { UserModule } from 'src/user/user.module'
import { AddressController } from './address.controller'
import { AddressService } from './address.service'

@Module({
	imports: [UserModule],
	controllers: [AddressController],
	providers: [AddressService, PrismaService]
})
export class AddressModule {}
