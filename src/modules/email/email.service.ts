import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

@Injectable()
export class EmailService {
  constructor(private readonly configService: ConfigService) {}

  async send(input: SendEmailInput) {
    const provider = this.configService.get<string>('EMAIL_PROVIDER', 'brevo');

    try {
      if (provider === 'smtp') {
        await this.sendWithSmtp(input);
        return;
      }

      await this.sendWithBrevo(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';

      throw new InternalServerErrorException(
        `Nao foi possivel enviar o e-mail transacional: ${message}`,
      );
    }
  }

  private async sendWithBrevo({ to, subject, html }: SendEmailInput) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    const fromEmail = this.getRequiredConfig('MAIL_FROM');
    const fromName = this.configService.get<string>(
      'MAIL_FROM_NAME',
      'Suporte Assinae',
    );

    if (!apiKey) {
      throw new Error('BREVO_API_KEY nao configurada');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: fromName,
          email: fromEmail,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brevo respondeu ${response.status}: ${body}`);
    }
  }

  private async sendWithSmtp({ to, subject, html }: SendEmailInput) {
    const host = this.getRequiredConfig('MAIL_HOST');
    const port = Number(this.getRequiredConfig('MAIL_PORT'));
    const user = this.getRequiredConfig('MAIL_USER');
    const pass = this.getRequiredConfig('MAIL_PASS');
    const fromEmail = this.getRequiredConfig('MAIL_FROM');
    const fromName = this.configService.get<string>(
      'MAIL_FROM_NAME',
      'Suporte Assinae',
    );

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
    });
  }

  private getRequiredConfig(key: string) {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} nao configurado`);
    }

    return value;
  }
}
