import {
  BadRequestException, ConflictException,
  Injectable, NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRepository } from './repository/user.repository';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

// 'avatarUrl' entrou na lista: a foto agora tem rota própria
// (updateAvatar) e não deve ser alterada pelo endpoint genérico de perfil.
const CAMPOS_PROIBIDOS_PERFIL = ['senha', 'senhaHash', 'avatarUrl'] as const;

const SALT_ROUNDS = 10;

@Injectable()
export class UserService {
  constructor(private readonly repo: UserRepository) {}

  // ── perfil (contexto /me) ──────────────────────────────────────────

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    if (Object.keys(dto).length === 0)
      throw new BadRequestException('Nenhum campo informado para atualização');

    for (const campo of CAMPOS_PROIBIDOS_PERFIL) {
      if (campo in dto)
        throw new BadRequestException(`O campo '${campo}' não pode ser alterado neste endpoint`);
    }

    if (dto.email) {
      dto.email = dto.email.toLowerCase();
      if (await this.repo.emailInUse(dto.email, userId))
        throw new ConflictException('E-mail já está em uso');
    }

    const atualizado = await this.repo.update(userId, dto);
    if (!atualizado) throw new NotFoundException('Usuário não encontrado');
    return atualizado;
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const usuario = await this.repo.findByIdWithPassword(userId);
    if (!usuario) throw new NotFoundException('Usuário não encontrado');

    const senhaAtualConfere = await bcrypt.compare(dto.currentPassword, usuario.senha);
    if (!senhaAtualConfere) throw new BadRequestException('Senha atual incorreta');

    const senhaIgualAAnterior = await bcrypt.compare(dto.newPassword, usuario.senha);
    if (senhaIgualAAnterior)
      throw new BadRequestException('A nova senha deve ser diferente da senha atual');

    const senhaHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    const atualizado = await this.repo.updatePassword(userId, senhaHash);
    if (!atualizado) throw new NotFoundException('Usuário não encontrado');

    return { message: 'Senha alterada com sucesso' };
  }

  // Recebe apenas a URL final do arquivo — o upload/armazenamento em si
  // (S3, disco, etc.) deve ser resolvido antes de chegar aqui, tipicamente
  // no controller ou em um serviço de storage dedicado.
  async updateAvatar(userId: number, avatarUrl: string) {
    if (!avatarUrl) throw new BadRequestException('Nenhuma imagem informada');

    const atualizado = await this.repo.updateAvatar(userId, avatarUrl);
    if (!atualizado) throw new NotFoundException('Usuário não encontrado');
    return atualizado;
  }

  async getActivitySummary(userId: number) {
    const [historico, horasCertificados] = await Promise.all([
      this.repo.findEventHistory(userId),
      this.repo.findSignedCertificateHours(userId),
    ]);

    const eventosOrganizados = new Set(
      historico.filter(item => item.papel === 'organizador').map(item => item.eventoId),
    ).size;

    return {
      message: 'Resumo de atividade do usuário',
      data: {
        eventosOrganizados,
        certificadosRecebidos: horasCertificados.length,
        cargaHorariaTotal: horasCertificados.reduce((total, horas) => total + horas, 0),
        historico,
      },
    };
  }

  // ── admin (contexto /user) ─────────────────────────────────────────

  async getUser(id: number) {
    const usuario = await this.repo.findById(id);
    if (!usuario) throw new NotFoundException('Usuário não encontrado');
    return usuario;
  }

  async updateUser(id: number, dto: UpdateUserDto) {
    if (Object.keys(dto).length === 0)
      throw new BadRequestException('Nenhum campo informado para atualização');

    if (dto.email) {
      dto.email = dto.email.toLowerCase();
      if (await this.repo.emailInUse(dto.email, id))
        throw new ConflictException('E-mail já está em uso');
    }

    const atualizado = await this.repo.update(id, dto);
    if (!atualizado) throw new NotFoundException('Usuário não encontrado');
    return atualizado;
  }

  async deleteUser(id: number) {
    const usuario = await this.repo.findById(id);
    if (!usuario) throw new NotFoundException('Usuário não encontrado');
    await this.repo.delete(id);
  }

  async listAllUsers() {
    return this.repo.findAll();
  }
}