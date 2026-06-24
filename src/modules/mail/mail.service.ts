import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface EmailPayload {
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private devTransporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (this.isProduction()) {
      return;
    }

    if (this.configService.get<string>('SKIP_EMAIL_SENDING') === 'true') {
      return;
    }

    try {
      const testAccount = await nodemailer.createTestAccount();
      this.devTransporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      this.logger.log(
        'Nodemailer Ethereal transport initialized for development',
      );
    } catch (error) {
      this.logger.warn(
        `Failed to initialize Ethereal transport: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const verifyUrl = `${frontendUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const template = this.buildVerificationTemplate(verifyUrl);
    await this.send(to, template);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const template = this.buildPasswordResetTemplate(resetUrl);
    await this.send(to, template);
  }

  private async send(to: string, template: EmailPayload): Promise<void> {
    if (this.configService.get<string>('SKIP_EMAIL_SENDING') === 'true') {
      this.logger.log(`[MAIL DEV] Skipped email to ${to}: ${template.subject}`);
      return;
    }

    if (this.isProduction()) {
      await this.sendViaMailgun(to, template);
      return;
    }

    await this.sendViaNodemailer(to, template);
  }

  private async sendViaMailgun(
    to: string,
    template: EmailPayload,
  ): Promise<void> {
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL');
    const fromName =
      this.configService.get<string>('MAILGUN_FROM_NAME') ?? 'NexaFX';

    if (!apiKey || !domain || !fromEmail) {
      throw new Error(
        'Missing Mailgun configuration: MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL are required',
      );
    }

    const mailgun = new Mailgun(FormData);
    const client = mailgun.client({ username: 'api', key: apiKey });

    await client.messages.create(domain, {
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  private async sendViaNodemailer(
    to: string,
    template: EmailPayload,
  ): Promise<void> {
    if (!this.devTransporter) {
      this.logger.log(`[MAIL DEV] ${template.subject} for ${to}`);
      return;
    }

    const fromEmail =
      this.configService.get<string>('MAILGUN_FROM_EMAIL') ??
      'noreply@nexafx.local';

    const info = await this.devTransporter.sendMail({
      from: `NexaFX <${fromEmail}>`,
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      this.logger.log(`[MAIL DEV] Preview URL: ${previewUrl}`);
    }
  }

  private buildVerificationTemplate(verifyUrl: string): EmailPayload {
    return {
      subject: 'Verify your NexaFX email address',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Verify your email</h2>
          <p>Click the button below to verify your NexaFX account. This link expires in 24 hours.</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#F5A623;color:#fff;text-decoration:none;border-radius:8px;">Verify Email</a></p>
          <p style="font-size:12px;color:#666;">If the button does not work, copy this link:<br/>${verifyUrl}</p>
        </div>
      `,
      text: `Verify your NexaFX email address:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    };
  }

  private buildPasswordResetTemplate(resetUrl: string): EmailPayload {
    return {
      subject: 'Reset your NexaFX password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Password reset</h2>
          <p>We received a request to reset your password. This link expires in 1 hour.</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#F5A623;color:#fff;text-decoration:none;border-radius:8px;">Reset Password</a></p>
          <p style="font-size:12px;color:#666;">If you did not request this, ignore this email.</p>
        </div>
      `,
      text: `Reset your NexaFX password:\n\n${resetUrl}\n\nThis link expires in 1 hour.`,
    };
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
