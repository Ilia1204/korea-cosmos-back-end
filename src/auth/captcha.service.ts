import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class CaptchaService {
	constructor(private configService: ConfigService) {}

	getWidgetHtml(): string {
		const clientKey =
			this.configService.get('SMARTCAPTCHA_CLIENT_KEY') ||
			'ysc1_K8ueAu9hUEi4oxTuLFmfhg7flvUQZkCWtLCnycKo97bd9539'

		return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background-color: #ffffff;
    }
  </style>
</head>
<body>
  <div id="captcha-container"></div>
  <script src="https://smartcaptcha.yandexcloud.net/captcha.js?render=onload&onload=onCaptchaLoad" defer></script>
  <script>
    window.onCaptchaLoad = function () {
      window.smartCaptcha.render('captcha-container', {
        sitekey: '${clientKey}',
        hl: 'ru',
        callback: function (token) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', token: token }))
        }
      })
    }
  </script>
</body>
</html>
`
	}

	async verify(token: string, ip?: string): Promise<boolean> {
		const serverKey = this.configService.get('SMARTCAPTCHA_SERVER_KEY')
		if (!serverKey || !token) return false

		try {
			const params = new URLSearchParams({ secret: serverKey, token })
			if (ip) params.set('ip', ip)

			const res = await fetch(
				`https://smartcaptcha.yandexcloud.net/validate?${params.toString()}`
			)
			if (!res.ok) return false

			const data: { status: string } = await res.json()
			return data.status === 'ok'
		} catch {
			return false
		}
	}
}
