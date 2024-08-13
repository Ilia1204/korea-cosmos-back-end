import { MailerService } from '@nestjs-modules/mailer'
import {
	BadRequestException,
	Injectable,
	NotFoundException,
	UnauthorizedException
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { hash, verify } from 'argon2'
import { Response } from 'express'
import * as nodemailer from 'nodemailer'
import { UserService } from 'src/user/user.service'
import { AuthDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
	EXPIRE_DAY_REFRESH_TOKEN = 1
	REFRESH_TOKEN_NAME = 'refreshToken'

	constructor(
		private jwt: JwtService,
		private userService: UserService,
		private readonly mailService: MailerService
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

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { password, ...user } = await this.userService.create(dto)

		const tokens = this.issueTokens(user.id)

		return {
			user,
			...tokens
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

		if (!user) throw new NotFoundException('Пользователь не найден')

		const isValid = await verify(user.password, dto.password)

		if (!isValid) throw new UnauthorizedException('Неправильный пароль')

		return user
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

	async sendPasswordResetEmail(email: string) {
		const user = await this.userService.getByEmail(email)
		if (!user) throw new NotFoundException('Пользователь не найден')

		const token = this.jwt.sign({ email }, { expiresIn: '1h' })

		const transporter = nodemailer.createTransport({
			service: 'gmail',
			auth: {
				user: 'lower013634@gmail.com',
				pass: 'Loaf7890'
			}
		})

		const mailOptions = {
			from: 'lower013634@gmail.com',
			to: user.email,
			subject: 'Password Reset',
			text: `To reset your password, please click the following link: $ergerg/reset-password?token=${token}`
		}

		await transporter.sendMail(mailOptions)
	}

	async sendMail() {
		const message = `Forgot your password? If you didn't forget your password, please ignore this email!`

		this.mailService.sendMail({
			from: 'demomailtrap.com',
			to: 'non62526@gmail.com',
			subject: `How to Send Emails with Nodemailer`,
			text: message
		})
	}

	async resetPassword(token: string, newPassword: string) {
		const decoded = this.jwt.verify(token)
		const user = await this.userService.getByEmail(decoded.email)

		if (!user) {
			throw new UnauthorizedException('Invalid or expired token')
		}

		const hashedPassword = await hash(newPassword)

		await this.userService.updatePassword(user.id, hashedPassword)
	}
}
