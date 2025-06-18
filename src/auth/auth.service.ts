import {
	BadRequestException,
	Injectable,
	NotFoundException,
	UnauthorizedException
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { hash, verify } from 'argon2'
import axios from 'axios'
import { Response } from 'express'
import { AddressService } from 'src/address/address.service'
import { EmailService } from 'src/email/email.service'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { AuthDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
	EXPIRE_DAY_REFRESH_TOKEN = 1
	REFRESH_TOKEN_NAME = 'refreshToken'

	constructor(
		private jwt: JwtService,
		private userService: UserService,
		private prisma: PrismaService,
		private emailService: EmailService,
		private addressService: AddressService
	) {}

	async login(dto: AuthDto) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { password, ...user } = await this.validateUser(dto)
		const tokens = this.issueTokens(user.id)

		return {
			user,
			...tokens
		}
	}

	async register(dto: AuthDto) {
		const oldUser = await this.userService.getByEmail(dto.email)

		if (oldUser)
			throw new BadRequestException('Пользователь с такие email уже существует')

		// Проверяем не существует ли уже на WordPress
		const wpExists = await this.tryWordPressAuth(dto.email, dto.password)
		if (wpExists) throw new BadRequestException('Этот email уже зарегистрирован. Войдите через кнопку «Войти».')

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { password, ...user } = await this.userService.create(dto)

		// Создаём аккаунт на WordPress в фоне
		this.createWordPressAccount(dto.email, dto.password).catch(() => null)

		const tokens = this.issueTokens(user.id)

		return {
			user,
			...tokens
		}
	}

	private async createWordPressAccount(email: string, password: string) {
		try {
			await axios.post(
				`${process.env.WP_URL}/wp-json/wc/v3/customers`,
				{ email, password, username: email },
				{
					auth: {
						username: process.env.WC_CONSUMER_KEY,
						password: process.env.WC_CONSUMER_SECRET
					}
				}
			)
		} catch {
			// Тихий фейл — аккаунт в мобилке всё равно создан
		}
	}

	async getNewTokens(refreshToken: string) {
		const result = await this.jwt.verifyAsync(refreshToken)
		if (!result) throw new UnauthorizedException('Невалидный токен')

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { password, ...user } = await this.userService.getById(result.id)

		const tokens = this.issueTokens(user.id)

		return {
			user,
			...tokens
		}
	}

	private issueTokens(userId: string) {
		const data = { id: userId }

		const accessToken = this.jwt.sign(data, {
			expiresIn: '1h'
		})

		const refreshToken = this.jwt.sign(data, {
			expiresIn: '7d'
		})

		return { accessToken, refreshToken }
	}

	private async validateUser(dto: AuthDto) {
		const user = await this.userService.getByEmail(dto.email)

		if (user) {
			const isValid = await verify(user.password, dto.password)
			if (isValid) {
				// Синхронизируем профиль и лояльность из WP/RetailCRM при каждом входе
				this.userService.syncProfileFromWordPress(user.id, dto.email).catch(() => null)
				if (user.phone)
					this.userService
						.syncLoyaltyFromRetailCRM(user.id, user.phone)
						.catch(() => null)
				return user
			}
		}

		// Пробуем авторизоваться через WordPress
		const wpData = await this.tryWordPressAuth(dto.email, dto.password)

		if (wpData) {
			if (user) {
				await this.userService.updatePassword(user.id, await hash(dto.password))
				return user
			}
			const newUser = await this.userService.createFromWordPress(
				dto.email,
				dto.password,
				wpData.user_display_name
			)
			this.addressService
				.importFromWooCommerce(newUser.id, dto.email)
				.catch(() => null)
			return newUser
		}

		if (!user) throw new NotFoundException('Пользователь не найден')
		throw new UnauthorizedException('Неправильный пароль')
	}

	private async tryWordPressAuth(
		email: string,
		password: string
	): Promise<{ user_display_name: string; user_email: string } | null> {
		try {
			const { data } = await axios.post(
				`${process.env.WP_URL}/wp-json/jwt-auth/v1/token`,
				{ username: email, password }
			)
			return data
		} catch {
			return null
		}
	}

	addRefreshTokenToResponse(res: Response, refreshToken: string) {
		const expiresIn = new Date()
		expiresIn.setDate(expiresIn.getDate() + this.EXPIRE_DAY_REFRESH_TOKEN)

		res.cookie(this.REFRESH_TOKEN_NAME, refreshToken, {
			httpOnly: true,
			domain: 'localhost',
			expires: expiresIn,
			secure: true,
			// lax if production
			sameSite: 'none'
		})
	}

	removeRefreshTokenFromResponse(res: Response) {
		res.cookie(this.REFRESH_TOKEN_NAME, '', {
			httpOnly: true,
			domain: 'localhost',
			expires: new Date(0),
			secure: true,
			// lax if production
			sameSite: 'none'
		})
	}

	async resetPassword(email: string) {
		const user = await this.prisma.user.findUnique({
			where: { email }
		})

		if (!user)
			throw new NotFoundException('Пользователь с таким email не найден')

		const newPassword = this.generateRandomPassword()
		const hashedPassword = await hash(newPassword)

		await this.prisma.user.update({
			where: { email },
			data: { password: hashedPassword }
		})

		await this.emailService.sendPasswordResetEmail(user.email, newPassword)

		return { message: 'Письмо с новым паролем было отправлено на ваш email!' }
	}

	generateRandomPassword(length = 8) {
		const chars =
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
		let password = ''
		for (let i = 0; i < length; i++) {
			const randomIndex = Math.floor(Math.random() * chars.length)
			password += chars[randomIndex]
		}
		return password
	}
}
