import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq, or, and, gt } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { db } from '../../db';
import { tabelaUsuario } from '../../db/schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ConfigService } from '@nestjs/config';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { name, email, password } = registerDto;

    const [userExists] = await db
      .select()
      .from(tabelaUsuario)
      .where(or(eq(tabelaUsuario.email, email)))
      .limit(1);

    if (userExists) {
      throw new ConflictException('E-mail já cadastrado.');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    const codeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const [newUser] = await db
      .insert(tabelaUsuario)
      .values({
        nome: name,
        email: email,
        senha: hashedPassword,
        isActive: false,
        verificationCode: verificationCode,
        codeExpiresAt: codeExpiresAt,
      })
      .returning({
        id: tabelaUsuario.id,
        name: tabelaUsuario.nome,
        email: tabelaUsuario.email,
      });

    const link = `${this.configService.get<string>('FRONTEND_URL')}/register?step=code&email=${encodeURIComponent(registerDto.email)}`;

    try {
      await this.emailService.send({
        to: registerDto.email,
        subject: 'Confirme seu cadastro - Assinaê',
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>Bem-vindo ao Assinaê!</h2>
            <p>Seu código de confirmação é:</p>
            <h1 style="letter-spacing: 5px; color: #4F46E5;">${verificationCode}</h1>
            <p>Este código expira em 15 minutos.</p>
            <p>
              <a href="${link}" style="color: #4F46E5;">
                Clique aqui para confirmar
              </a>
            </p>
          </div>
        `,
      });
    } catch (error) {
      await db.delete(tabelaUsuario).where(eq(tabelaUsuario.id, newUser.id));
      throw error;
    }

    return {
      message:
        'Usuário cadastrado com sucesso! Confira seu e-mail para o código de confirmação.',
      data: { user: newUser },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const [user] = await db
      .select()
      .from(tabelaUsuario)
      .where(eq(tabelaUsuario.email, email))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Sua conta ainda não foi ativada. Verifique seu e-mail com o código de confirmação.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.senha);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const payload = { id: user.id, name: user.nome, email: user.email };
    const access_token = await this.jwtService.signAsync(payload);

    return {
      message: 'Usuário autenticado com sucesso.',
      data: {
        user: {
          id: user.id,
          name: user.nome,
          email: user.email,
        },
        access_token,
      },
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const [user] = await db
      .select()
      .from(tabelaUsuario)
      .where(eq(tabelaUsuario.email, email))
      .limit(1);
    if (!user) {
      return {
        message:
          'Se o e-mail existir em nosso sistema, um link de recuperação será enviado.',
        data: {},
      };
    }

    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await db
      .update(tabelaUsuario)
      .set({ resetPasswordToken: token, resetPasswordExpires: expires })
      .where(eq(tabelaUsuario.id, user.id));

    const frontUrl = this.configService.get<string>('FRONTEND_URL');
    const resetLink = `${frontUrl}/redefine-password?token=${token}`;

    await this.emailService.send({
      to: user.email,
      subject: 'Recuperação de Senha',
      html: `
        <p>Olá, ${user.nome}!</p>
        <p>Você solicitou a alteração da sua senha.</p>
        <p>Clique no link abaixo para cadastrar uma nova senha (válido por 15 minutos):</p>
        <a href="${resetLink}" target="_blank">${resetLink}</a>
      `,
    });

    return {
      message:
        'Se o e-mail existir em nosso sistema, um link de recuperação será enviado.',
      data: {},
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    const [user] = await db
      .select()
      .from(tabelaUsuario)
      .where(
        and(
          eq(tabelaUsuario.resetPasswordToken, token),
          gt(tabelaUsuario.resetPasswordExpires, new Date()),
        ),
      )
      .limit(1);

    if (!user) {
      throw new BadRequestException(
        'O token de recuperação é inválido ou já expirou.',
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db
      .update(tabelaUsuario)
      .set({
        senha: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      })
      .where(eq(tabelaUsuario.id, user.id));

    return {
      message: 'Senha alterada com sucesso! Você já pode fazer login.',
      data: {},
    };
  }

  async verifyCode(verifyDto: VerifyCodeDto) {
    const [user] = await db
      .select()
      .from(tabelaUsuario)
      .where(eq(tabelaUsuario.email, verifyDto.email))
      .limit(1);

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (user.verificationCode !== verifyDto.code) {
      throw new BadRequestException('Código inválido.');
    }

    if (!user.codeExpiresAt) {
      throw new BadRequestException(
        'Este código é inválido ou já foi utilizado.',
      );
    }

    if (new Date() > user.codeExpiresAt) {
      throw new BadRequestException(
        'Este código já expirou. Solicite um novo.',
      );
    }

    await db
      .update(tabelaUsuario)
      .set({ isActive: true, verificationCode: null, codeExpiresAt: null })
      .where(eq(tabelaUsuario.id, user.id))
      .returning({
        id: tabelaUsuario.id,
        name: tabelaUsuario.nome,
        email: tabelaUsuario.email,
      });

    const payload = { id: user.id, name: user.nome, email: user.email };
    const access_token = await this.jwtService.signAsync(payload);

    return {
      message: 'Conta verificada com sucesso.',
      data: {
        user: {
          id: user.id,
          name: user.nome,
          email: user.email,
        },
        access_token,
      },
    };
  }
}
