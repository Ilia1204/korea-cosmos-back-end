import { Injectable } from '@nestjs/common'
import * as nodemailer from 'nodemailer'

@Injectable()
export class EmailService {
	private transporter

	constructor() {
		this.transporter = nodemailer.createTransport({
			service: 'Yandex',
			host: process.env.EMAIL_HOST,
			port: 465,
			secure: true,
			auth: {
				user: process.env.EMAIL_USERNAME,
				pass: process.env.EMAIL_PASSWORD
			}
		})
	}

	async sendPasswordResetEmail(email: string, newPassword: string) {
		const mailOptions = {
			from: process.env.EMAIL_USERNAME,
			to: email,
			subject: 'Сброс пароля в KoreaCosmos',
			html: `
  <!DOCTYPE html>
    html lang="ru">
    <head>
    <meta charset="UTF-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Сброс пароля</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&display=swap');
      body {
        font-family: "Lora", sans-serif;
        background-color: #f4f4f4;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 10px;
        padding: 20px;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
      }
      .header {
        background-color: #f9f9f9;
        padding: 20px;
        border-bottom: 1px solid #ddd;
        text-align: center;
        border-top-left-radius: 10px;
        border-top-right-radius: 10px;
      }
      .heading {
        font-weight: 600;
        font-size: 20px;
      }
      .header img {
        max-width: 150px;
        height: auto;
      }
      .content {
        padding: 20px;
      }
      .footer {
        text-align: center;
        padding: 20px;
        font-size: 12px;
        color: #666;
        border-top: 1px solid #ddd;
      }
      .btn {
        display: inline-block;
        font-size: 16px;
        font-weight: 400;
        color: #ffffff;
        background-color: #FE87C1;
        padding: 10px 20px;
        border-radius: 8px;
        text-decoration: none;
        margin-top: 10px;
      }
      .text {
        color: #6A6B8F;
        font-size: 16px;
        font-weight: 400;
      }
      .btn:hover {
        background-color: #FE77B7;
      }
      .text-center {
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://koreacosmos.ru/wp-content/themes/koreacosmos/assets/img/2.2.png" alt="KoreaCosmos" width="200" height="120" style="resize-mode: contain;">
      </div>
      <div class="content">
        <h1 class="heading">👋 Здравствуйте!</h1>
        <p class="text">Вы запросили сброс пароля для вашей учетной записи в KoreaCosmos. Ваш новый пароль:</p>
        <p style="font-size: 18px; font-weight: 600;">${newPassword}</p>
        <p class="text">Вы можете изменить его в настройках ваше го профиля. Если вы не делали этот запрос, просто проигнорируйте это сообщение.</p>
        <a href="https://koreacosmos.ru" class="btn">Посетите наш магазин</a>
      </div>
      <div class="footer">
        <p>С уважением, команда KoreaCosmos 🚀</p>
        <p>Если у вас есть вопросы, ответьте на это письмо или свяжитесь с нашей службой поддержки. 💬</p>
      </div>
    </div>
  </body>
  </html>
      `
		}

		await this.transporter.sendMail(mailOptions)
	}
}
