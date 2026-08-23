import {
	Body,
	Controller,
	Get,
	HttpCode,
	Post,
	Req,
	Res,
	UnauthorizedException,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { CaptchaService } from './captcha.service'
import { AuthDto } from './dto/auth.dto'
import {
	ResetPasswordDto,
	SendVerificationCodeDto,
	VerifyEmailDto
} from './dto/email-verification.dto'
import { PhoneDto } from './dto/phone-auth.dto'
import { RegisterDto } from './dto/register.dto'

@Controller('auth')
@UsePipes(new ValidationPipe())
@Throttle({ default: { ttl: 60000, limit: 10 } })
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly captchaService: CaptchaService
	) {}

	@Get('captcha-widget')
	captchaWidget(@Res() res: Response) {
		res.set('Content-Type', 'text/html; charset=utf-8')
		res.send(this.captchaService.getWidgetHtml())
	}

	@HttpCode(200)
	@Post('login')
	async login(@Body() dto: AuthDto, @Res({ passthrough: true }) res: Response) {
		const { refreshToken, ...response } = await this.authService.login(dto)
		this.authService.addRefreshTokenToResponse(res, refreshToken)
		return { ...response, refreshToken }
	}

	@HttpCode(200)
	@Post('register')
	async register(
		@Body() dto: RegisterDto,
		@Res({ passthrough: true }) res: Response
	) {
		const { refreshToken, ...response } = await this.authService.register(dto)
		this.authService.addRefreshTokenToResponse(res, refreshToken)
		return { ...response, refreshToken }
	}

	@HttpCode(200)
	@Post('send-verification-code')
	async sendVerificationCode(@Body() dto: SendVerificationCodeDto) {
		return this.authService.sendVerificationCode(dto.email)
	}

	@HttpCode(200)
	@Post('verify-email')
	async verifyEmail(@Body() dto: VerifyEmailDto) {
		return this.authService.verifyEmail(dto.email, dto.code)
	}

	@HttpCode(200)
	@Post('login/access-token')
	async getNewTokens(
		@Req() req: Request,
		@Res({ passthrough: true }) res: Response,
		@Body('refreshToken') bodyRefreshToken?: string
	) {
		const token =
			bodyRefreshToken ?? req.cookies[this.authService.REFRESH_TOKEN_NAME]

		if (!token) {
			this.authService.removeRefreshTokenFromResponse(res)
			throw new UnauthorizedException('Refresh token not passed')
		}

		const { refreshToken, ...response } = await this.authService.getNewTokens(
			token
		)

		this.authService.addRefreshTokenToResponse(res, refreshToken)

		return { ...response, refreshToken }
	}

	@HttpCode(200)
	@Post('logout')
	async logout(@Res({ passthrough: true }) res: Response) {
		this.authService.removeRefreshTokenFromResponse(res)
		return true
	}

	@HttpCode(200)
	@Post('reset-password')
	async resetPassword(@Body() dto: ResetPasswordDto) {
		return this.authService.resetPassword(dto.email)
	}

	@HttpCode(200)
	@Post('phone/send-otp')
	async sendPhoneOtp(@Body() dto: PhoneDto) {
		return this.authService.sendPhoneOtp(dto)
	}

	@HttpCode(200)
	@Post('phone/poll-call')
	async pollCallStatus(
		@Body() dto: PhoneDto,
		@Res({ passthrough: true }) res: Response
	) {
		return this.authService.pollCallStatus(dto, res)
	}
}
