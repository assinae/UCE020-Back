// src/modules/certificate/certificate.service.ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertEventOrganizer } from 'src/common/helpers/assert-event-organizer.helper';
import { CertificateRepository } from './repository/certificate.respository';
import {
  mapGuestRole as mapGuestRoleShared,
  mapParticipantRole,
} from './certificate-roles';
import { formatBahiaDate } from 'src/common/helpers/bahia-date.helper';

@Injectable()
export class CertificateService {
  constructor(private readonly repo: CertificateRepository) {}

  // certificate.service.ts
  async getCertificatesByEvent(eventoId: number, page: number, limit: number) {
    const rows = await this.repo.findByEvent(eventoId, page, limit);

    return rows.map((row) => this.toCertificateDto(row));
  }

  async getCertificateById(rawId: string) {
    const [kind, idPart] = rawId.split('-');
    const certificateId = Number(idPart);

    if (
      (kind !== 'guest' && kind !== 'user' && kind !== 'activity') ||
      !Number.isInteger(certificateId)
    ) {
      throw new NotFoundException('Certificado não encontrado.');
    }

    const row =
      kind === 'guest'
        ? await this.repo.findGuestCertificateById(certificateId)
        : kind === 'activity'
          ? await this.repo.findActivityCertificateById(certificateId)
          : await this.repo.findUserCertificateById(certificateId);

    if (!row) {
      throw new NotFoundException('Certificado não encontrado.');
    }

    return this.toCertificateDto(row);
  }

  async getCertificateStatsByEvent(eventoId: number) {
    const [rows, guestTotal] = await Promise.all([
      this.repo.countByRole(eventoId),
      this.repo.countGuestCertificatesByEvent(eventoId),
    ]);
    const counts = new Map(
      rows.map((row) => [this.mapRole(row.role), row.count]),
    );
    // Convidados (palestrante/ministrante/moderador) não têm cards próprios na tela de
    // certificados gerados hoje — todo convidado certificado entra no card "Palestrante".
    counts.set('Palestrante', guestTotal);

    return ['Ouvinte', 'Monitor', 'Organizador', 'Palestrante'].map((role) => ({
      role,
      count: counts.get(role) ?? 0,
    }));
  }

  async generateGuestCertificates(atividadeId: number, userId: number) {
    const atividade = await this.repo.findActivityForCertificate(atividadeId);
    if (!atividade) {
      throw new NotFoundException('Atividade não encontrada.');
    }

    await assertEventOrganizer(userId, atividade.eventoId);

    if (atividade.status !== 'finalizada') {
      throw new ForbiddenException(
        'Só é possível emitir certificados de convidado após a atividade ser finalizada.',
      );
    }

    const guests = await this.repo.findGuestsByActivity(atividadeId);
    if (!guests.length) {
      throw new NotFoundException(
        'Nenhum convidado encontrado para esta atividade.',
      );
    }

    // Idempotência olha a existência da linha, não arquivo_pdf: o campo é
    // sempre nulo agora e reemitiria para todo mundo a cada chamada.
    const existing =
      await this.repo.findExistingGuestCertificatesByActivity(atividadeId);
    const existingByConvidadoId = new Map(
      existing.map((cert) => [cert.convidadoId, cert]),
    );
    const pending = guests.filter(
      (guest) => !existingByConvidadoId.has(guest.convidadoId),
    );

    const dataEmissao = new Date();
    const created = await this.repo.insertGuestCertificates(
      pending.map((guest) => ({
        convidadoId: guest.convidadoId,
        atividadeId,
        dataEmissao,
      })),
    );
    const createdByConvidadoId = new Map(
      created.map((cert) => [cert.convidadoId, cert]),
    );

    return {
      message: `${created.length} certificado(s) de convidado emitido(s).`,
      data: {
        issued: created.length,
        alreadyIssued: existingByConvidadoId.size,
        certificates: guests.map((guest) => {
          const cert =
            createdByConvidadoId.get(guest.convidadoId) ??
            existingByConvidadoId.get(guest.convidadoId)!;

          return {
            convidadoId: guest.convidadoId,
            name: guest.nome,
            email: guest.email,
            role: this.mapGuestRole(guest.funcao),
            alreadyIssued: existingByConvidadoId.has(guest.convidadoId),
            issueDate: formatBahiaDate(cert.dataEmissao),
          };
        }),
      },
    };
  }

  async generateActivityCertificates(atividadeId: number, userId: number) {
    const atividade = await this.repo.findActivityForCertificate(atividadeId);
    if (!atividade) {
      throw new NotFoundException('Atividade não encontrada.');
    }

    await assertEventOrganizer(userId, atividade.eventoId);

    if (!atividade.gerarCertificado) {
      throw new ForbiddenException(
        'Esta atividade não está configurada para emitir certificado individual. Ative a opção "Gerar Certificado da Atividade" ao editar a atividade.',
      );
    }

    if (atividade.status !== 'finalizada') {
      throw new ForbiddenException(
        'Só é possível emitir certificados de atividade após a atividade ser finalizada.',
      );
    }

    const participantes =
      await this.repo.findPresentParticipantsByActivity(atividadeId);
    if (!participantes.length) {
      throw new NotFoundException(
        'Nenhum participante com presença confirmada nesta atividade.',
      );
    }

    // Idempotência olha a existência da linha, não arquivo_pdf: o campo é
    // sempre nulo agora (PDF é gerado sob demanda) e reemitiria para todo
    // mundo a cada chamada.
    const existing =
      await this.repo.findExistingActivityCertificatesByActivity(atividadeId);
    const existingByUsuarioId = new Map(
      existing.map((cert) => [cert.usuarioId, cert]),
    );
    const pending = participantes.filter(
      (participante) => !existingByUsuarioId.has(participante.usuarioId),
    );

    const dataEmissao = new Date();
    const created = await this.repo.insertActivityCertificates(
      pending.map((participante) => ({
        usuarioId: participante.usuarioId,
        atividadeId,
        dataEmissao,
      })),
    );
    const createdByUsuarioId = new Map(
      created.map((cert) => [cert.usuarioId, cert]),
    );

    return {
      message: `${created.length} certificado(s) de atividade emitido(s).`,
      data: {
        issued: created.length,
        alreadyIssued: existingByUsuarioId.size,
        certificates: participantes.map((participante) => {
          const cert =
            createdByUsuarioId.get(participante.usuarioId) ??
            existingByUsuarioId.get(participante.usuarioId)!;

          return {
            usuarioId: participante.usuarioId,
            name: participante.nome,
            email: participante.email,
            role: this.mapRole(participante.tipo),
            alreadyIssued: existingByUsuarioId.has(participante.usuarioId),
            issueDate: formatBahiaDate(cert.dataEmissao),
          };
        }),
      },
    };
  }

  async generateParticipantCertificates(eventoId: number, userId: number) {
    const evento = await this.repo.findEventForCertificate(eventoId);
    if (!evento) {
      throw new NotFoundException('Evento não encontrado.');
    }

    await assertEventOrganizer(userId, eventoId);

    if (evento.status !== 'finalizada') {
      throw new ForbiddenException(
        'Só é possível emitir certificados após o evento ser finalizado.',
      );
    }

    const participacoes = await this.repo.findParticipacoesByEvent(eventoId);
    if (!participacoes.length) {
      throw new NotFoundException(
        'Nenhum participante encontrado para este evento.',
      );
    }

    // Idempotência olha a existência da linha, não arquivo_pdf: o campo é
    // sempre nulo agora e reemitiria para todo mundo a cada chamada.
    const existing =
      await this.repo.findExistingUserCertificatesByEvent(eventoId);
    const existingByUsuarioId = new Map(
      existing.map((cert) => [cert.usuarioId, cert]),
    );
    const pending = participacoes.filter(
      (participacao) => !existingByUsuarioId.has(participacao.usuarioId),
    );

    const dataEmissao = new Date();
    const created = await this.repo.insertUserCertificates(
      pending.map((participacao) => ({
        usuarioId: participacao.usuarioId,
        eventoId,
        dataEmissao,
      })),
    );
    const createdByUsuarioId = new Map(
      created.map((cert) => [cert.usuarioId, cert]),
    );

    return {
      message: `${created.length} certificado(s) emitido(s).`,
      data: {
        issued: created.length,
        alreadyIssued: existingByUsuarioId.size,
        certificates: participacoes.map((participacao) => {
          const cert =
            createdByUsuarioId.get(participacao.usuarioId) ??
            existingByUsuarioId.get(participacao.usuarioId)!;

          return {
            usuarioId: participacao.usuarioId,
            name: participacao.nome,
            email: participacao.email,
            role: this.mapRole(participacao.tipo),
            alreadyIssued: existingByUsuarioId.has(participacao.usuarioId),
            issueDate: formatBahiaDate(cert.dataEmissao),
          };
        }),
      },
    };
  }

  async getCertificatesByUser(usuarioId: number, page: number, limit: number) {
    const rows = await this.repo.findByUser(usuarioId, page, limit);
    return rows.map((row) => this.toCertificateDto(row));
  }

  private toCertificateDto(row: {
    id: number;
    dataEmissao: Date;
    participantName: string;
    participantEmail: string;
    role: string;
    location: string;
    activityTitle: string;
    activityHours: number | null;
    arquivoPdf: string | null;
    kind: 'user' | 'guest' | 'activity';
  }) {
    return {
      id: `${row.kind}-${row.id}`,
      title: row.activityTitle,
      participantName: row.participantName,
      participantEmail: row.participantEmail,
      role:
        row.kind === 'guest'
          ? this.mapGuestRole(row.role)
          : this.mapRole(row.role),
      hours: row.activityHours ?? undefined,
      location: row.location,
      issueDate: formatBahiaDate(row.dataEmissao),
      imageUrl: row.arquivoPdf ?? undefined,
    };
  }

  private mapRole(role: string): string {
    return mapParticipantRole(role);
  }

  private mapGuestRole(funcao: string): string {
    return mapGuestRoleShared(funcao);
  }
}
