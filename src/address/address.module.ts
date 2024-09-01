import { Module } from '@nestjs/common'
import { PrismaService } from 'src/prisma.service'
import { AddressController } from './address.controller'
import { AddressService } from './address.service'
import { UserService } from 'src/user/user.service'

@Module({
	controllers: [AddressController],
	providers: [AddressService, PrismaService, UserService]
})
export class AddressModule {}
