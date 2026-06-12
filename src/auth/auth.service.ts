import {
	BadRequestException,
	Injectable,
	NotFoundException,
	UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { hash, verify } from 'argon2'
import { Response } from 'express'
import { AddressService } from 'src/address/address.service'
import { EmailService } from 'src/email/email.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma.service'
import { SmsService } from 'src/sms/sms.service'
import { UserService } from 'src/user/user.service'
import { AuthDto } from './dto/auth.dto'
import { PhoneSendOtpDto, PhoneVerifyDto } from './dto/phone-auth.dto'
import { otpStore } from './otp.store'

@Injectable()
export class AuthService {
	private readonly EXPIRE_DAY_REFRESH_TOKEN = 1
	readonly REFRESH_TOKEN_NAME = 'refreshToken'

	constructor(
		private jwt: JwtService,
		private userService: UserService,
		private prisma: PrismaService,
		private emailService: EmailService,
		private addressService: AddressService,
		private smsService: SmsService,
		private configService: ConfigService,
		private notificationsService: NotificationsService
	) {}

	async login(dto: AuthDto) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { password, ...user } = await this.validateUser(dto)
		return { user, ...this.issueTokens(user.id) }
	}

	async register(dto: AuthDto) {
		const oldUser = await this.userService.getByEmail(dto.email)
		if (oldUser)
			throw new BadRequestException('Пользователь с таким email уже существует')

		const wpExists = await this.tryWordPressAuth(dto.email, dto.password)
		if (wpExists)
			throw new BadRequestException(
				'Этот email уже зарегистрирован. Войдите через кнопку «Войти».'
			)

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { password, ...user } = await this.userService.create(dto)
		this.createWordPressAccount(dto.email, dto.password).catch(() => null)
		this.notificationsService.sendPushNotificationToAdmins(
			'👤 Новый пользователь',
			`Зарегистрировался: ${dto.email}`,
			{ isRead: true }
		).catch(() => null)

		return { user, ...this.issueTokens(user.id) }
	}

	async getNewTokens(refreshToken: string) {
		const result = await this.jwt.verifyAsync(refreshToken)
		if (!result) throw new UnauthorizedException('Невалидный токен')

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { password, ...user } = await this.userService.getById(result.id)
		return { user, ...this.issueTokens(user.id) }
	}

	addRefreshTokenToResponse(res: Response, refreshToken: string) {
		const expires = new Date()
		expires.setDate(expires.getDate() + this.EXPIRE_DAY_REFRESH_TOKEN)

		res.cookie(this.REFRESH_TOKEN_NAME, refreshToken, {
			httpOnly: true,
			expires,
			secure: true,
			sameSite: 'none'
		})
	}

	removeRefreshTokenFromResponse(res: Response) {
		res.cookie(this.REFRESH_TOKEN_NAME, '', {
			httpOnly: true,
			expires: new Date(0),
			secure: true,
			sameSite: 'none'
		})
	}

	async resetPassword(email: string) {
		const user = await this.prisma.user.findUnique({ where: { email } })
		if (!user)
			throw new NotFoundException('Пользователь с таким email не найден')

		const newPassword = this.generateRandomPassword()
		await this.prisma.user.update({
			where: { email },
			data: { password: await hash(newPassword) }
		})
		await this.emailService.sendPasswordResetEmail(user.email, newPassword)
		return { message: 'Письмо с новым паролем было отправлено на ваш email!' }
	}

	async sendPhoneOtp(dto: PhoneSendOtpDto) {
		const phone = dto.phone.replace(/\D/g, '')
		const normalized = phone.startsWith('8') ? '7' + phone.slice(1) : phone

		const code = String(Math.floor(100000 + Math.random() * 900000))
		const stored = otpStore.set(normalized, code)

		if (!stored) {
			return { message: 'Код уже отправлен', alreadySent: true }
		}

		const sent = await this.smsService.sendSms(
			normalized,
			`Ваш код для входа в Korea Cosmos: ${code}`
		)

		if (!sent) {
			throw new BadRequestException('Не удалось отправить SMS. Попробуйте позже.')
		}

		return { message: 'Код отправлен' }
	}

	async verifyPhoneOtp(dto: PhoneVerifyDto, res: Response) {
		const phone = dto.phone.replace(/\D/g, '')
		const normalized = phone.startsWith('8') ? '7' + phone.slice(1) : phone

		const result = otpStore.verify(normalized, dto.code)

		if (result === 'expired') throw new UnauthorizedException('Код истёк')
		if (result === 'exceeded')
			throw new UnauthorizedException('Превышено количество попыток')
		if (result === 'invalid') throw new UnauthorizedException('Неверный код')

		// Ищем пользователя в локальной БД по номеру
		let user = await this.prisma.user.findFirst({
			where: { phone: { contains: normalized.slice(-10) } }
		})

		if (!user) {
			// Ищем в WooCommerce по номеру
			const wpEmail = await this.findWpEmailByPhone(normalized)

			if (wpEmail) {
				// Есть в WP — создаём в локальной БД
				user = await this.userService.getByEmail(wpEmail)
				if (!user) {
					user = await this.userService.createFromWordPress(
						wpEmail,
						this.generateRandomPassword(),
						''
					)
					this.addressService
						.importFromWooCommerce(user.id, wpEmail)
						.catch(() => null)
				}
			} else {
				// Нет нигде — создаём нового
				const email = `${normalized}@phone.koreacosmos.ru`
				user = await this.prisma.user.findUnique({ where: { email } })
				if (!user) {
					user = await this.prisma.user.create({
						data: {
							email,
							password: await hash(this.generateRandomPassword()),
							phone: '+' + normalized
						}
					})
					this.createWordPressAccount(email, this.generateRandomPassword()).catch(
						() => null
					)
					this.notificationsService.sendPushNotificationToAdmins(
						'👤 Новый пользователь',
						`Зарегистрировался по номеру: +${normalized}`,
						{ isRead: true }
					).catch(() => null)
				}
			}
		}

		if (user.phone)
			this.userService.syncLoyaltyFromRetailCRM(user.id, user.phone).catch(() => null)

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { password, ...safeUser } = user
		const tokens = this.issueTokens(user.id)
		this.addRefreshTokenToResponse(res, tokens.refreshToken)

		return { user: safeUser, accessToken: tokens.accessToken }
	}

	private async findWpEmailByPhone(normalized: string): Promise<string | null> {
		try {
			const secret = this.configService.get('KC_APP_SECRET')
			const wpUrl = this.configService.get('WP_URL')
			const res = await fetch(
				`${wpUrl}/wp-json/app/v1/customer-by-phone?phone=${normalized}&secret=${secret}`
			)
			const data = await res.json()
			return data.email || null
		} catch {
			return null
		}
	}

	private issueTokens(userId: string) {
		const data = { id: userId }
		return {
			accessToken: this.jwt.sign(data, { expiresIn: '1h' }),
			refreshToken: this.jwt.sign(data, { expiresIn: '7d' })
		}
	}

	private async validateUser(dto: AuthDto) {
		const user = await this.userService.getByEmail(dto.email)

		if (user) {
			const isValid = await verify(user.password, dto.password)
			if (isValid) {
				this.userService
					.syncProfileFromWordPress(user.id, dto.email)
					.catch(() => null)
				if (user.phone)
					this.userService
						.syncLoyaltyFromRetailCRM(user.id, user.phone)
						.catch(() => null)
				this.userService.recalculateLoyaltyLevel(user.id).catch(() => null)
				return user
			}
		}

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
			const res = await fetch(
				`${process.env.WP_URL}/wp-json/jwt-auth/v1/token`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ username: email, password })
				}
			)
			if (!res.ok) return null
			return res.json()
		} catch {
			return null
		}
	}

	private async createWordPressAccount(email: string, password: string) {
		try {
			const auth =
				'Basic ' +
				Buffer.from(
					`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
				).toString('base64')
			await fetch(`${process.env.WP_URL}/wp-json/wc/v3/customers`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: auth },
				body: JSON.stringify({ email, password, username: email })
			})
		} catch {}
	}

	private generateRandomPassword(length = 8) {
		const chars =
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
		return Array.from(
			{ length },
			() => chars[Math.floor(Math.random() * chars.length)]
		).join('')
	}
}
