import {
	Body,
	Controller,
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
import { AuthDto } from './dto/auth.dto'
import { PhoneSendOtpDto, PhoneVerifyDto } from './dto/phone-auth.dto'

@Controller('auth')
@UsePipes(new ValidationPipe())
@Throttle({ default: { ttl: 60000, limit: 10 } })
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@HttpCode(200)
	@Post('login')
	async login(@Body() dto: AuthDto, @Res({ passthrough: true }) res: Response) {
		const { refreshToken, ...response } = await this.authService.login(dto)
		this.authService.addRefreshTokenToResponse(res, refreshToken)

		return response
	}

	@HttpCode(200)
	@Post('register')
	async register(
		@Body() dto: AuthDto,
		@Res({ passthrough: true }) res: Response
	) {
		const { refreshToken, ...response } = await this.authService.register(dto)
		this.authService.addRefreshTokenToResponse(res, refreshToken)

		return response
	}

	@HttpCode(200)
	@Post('login/access-token')
	async getNewTokens(
		@Req() req: Request,
		@Res({ passthrough: true }) res: Response
	) {
		const refreshTokenFromCookies =
			req.cookies[this.authService.REFRESH_TOKEN_NAME]

		if (!refreshTokenFromCookies) {
			this.authService.removeRefreshTokenFromResponse(res)
			throw new UnauthorizedException('Refresh token not passed')
		}

		const { refreshToken, ...response } = await this.authService.getNewTokens(
			refreshTokenFromCookies
		)

		this.authService.addRefreshTokenToResponse(res, refreshToken)

		return response
	}

	@HttpCode(200)
	@Post('logout')
	async logout(@Res({ passthrough: true }) res: Response) {
		this.authService.removeRefreshTokenFromResponse(res)
		return true
	}

	@HttpCode(200)
	@Post('reset-password')
	async resetPassword(@Body('email') email: string) {
		return this.authService.resetPassword(email)
	}

	@HttpCode(200)
	@Post('phone/send-otp')
	async sendPhoneOtp(@Body() dto: PhoneSendOtpDto) {
		return this.authService.sendPhoneOtp(dto)
	}

	@HttpCode(200)
	@Post('phone/verify')
	async verifyPhoneOtp(
		@Body() dto: PhoneVerifyDto,
		@Res({ passthrough: true }) res: Response
	) {
		return this.authService.verifyPhoneOtp(dto, res)
	}
}
