// src/modules/certificate/certificate.service.ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertEventOrganizer } from 'src/common/helpers/assert-event-organizer.helper';
import { CertificateRepository } from './repository/certificate.respository';
import { CertificateFileStorageService } from './storage/certificate-file-storage.service';
import { renderGuestCertificatePdf } from './pdf/guest-certificate.pdf';
import { renderParticipantCertificatePdf } from './pdf/participant-certificate.pdf';
import { formatDateRange } from './pdf/format-date-range';
import {
  mapGuestRole as mapGuestRoleShared,
  mapParticipantRole,
} from './certificate-roles';
import { formatBahiaDate } from 'src/common/helpers/bahia-date.helper';

@Injectable()
export class CertificateService {
  constructor(
    private readonly repo: CertificateRepository,
    private readonly fileStorage: CertificateFileStorageService,
  ) {}

  // certificate.service.ts
  async getCertificatesByEvent(eventoId: number, page: number, limit: number) {
    const rows = await this.repo.findByEvent(eventoId, page, limit);

    return rows.map((row) => this.toCertificateDto(row));
  }

  async getCertificateById(rawId: string) {
    const [kind, idPart] = rawId.split('-');
    const certificateId = Number(idPart);

    if (
      (kind !== 'guest' && kind !== 'user') ||
      !Number.isInteger(certificateId)
    ) {
      throw new NotFoundException('Certificado não encontrado.');
    }

    const row =
      kind === 'guest'
        ? await this.repo.findGuestCertificateById(certificateId)
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

    const existing =
      await this.repo.findExistingGuestCertificatesByActivity(atividadeId);
    const existingByConvidadoId = new Map(
      existing
        .filter((cert) => cert.arquivoPdf)
        .map((cert) => [cert.convidadoId, cert]),
    );
    const existingWithoutFileByConvidadoId = new Map(
      existing
        .filter((cert) => !cert.arquivoPdf)
        .map((cert) => [cert.convidadoId, cert]),
    );
    const pending = guests.filter(
      (guest) => !existingByConvidadoId.has(guest.convidadoId),
    );

    const dataEmissao = new Date();
    const created = await this.repo.insertGuestCertificates(
      pending
        .filter(
          (guest) => !existingWithoutFileByConvidadoId.has(guest.convidadoId),
        )
        .map((guest) => ({
          convidadoId: guest.convidadoId,
          atividadeId,
          dataEmissao,
        })),
    );
    const createdByConvidadoId = new Map(
      created.map((cert) => [cert.convidadoId, cert]),
    );

    for (const guest of pending) {
      const cert =
        existingWithoutFileByConvidadoId.get(guest.convidadoId) ??
        createdByConvidadoId.get(guest.convidadoId);
      if (!cert) continue;

      const pdf = await renderGuestCertificatePdf({
        certificateId: cert.id,
        guestName: guest.nome,
        role: this.mapGuestRole(guest.funcao),
        eventName: atividade.eventoNome,
        activityName: atividade.nome,
        workloadHours: atividade.cargaHoraria,
        location: atividade.localizacao,
        eventDate: formatDateRange(atividade.dataInicio, atividade.dataFim),
        issueDate: cert.dataEmissao,
        assinante1Nome: atividade.assinante1Nome ?? undefined,
        assinante1Titulo: atividade.assinante1Titulo ?? undefined,
        assinante2Nome: atividade.assinante2Nome ?? undefined,
        assinante2Titulo: atividade.assinante2Titulo ?? undefined,
      });
      const fileUrl = await this.fileStorage.saveGuestCertificatePdf(
        cert.id,
        guest.nome,
        atividade.nome,
        pdf,
      );
      try {
        await this.repo.setGuestCertificateFile(cert.id, fileUrl);
      } catch (error) {
        await this.fileStorage.remove(fileUrl);
        throw error;
      }
      cert.arquivoPdf = fileUrl;
    }

    return {
      message: `${pending.length} certificado(s) de convidado emitido(s).`,
      data: {
        issued: pending.length,
        alreadyIssued: existingByConvidadoId.size,
        certificates: guests.map((guest) => {
          const cert =
            createdByConvidadoId.get(guest.convidadoId) ??
            existingWithoutFileByConvidadoId.get(guest.convidadoId) ??
            existingByConvidadoId.get(guest.convidadoId)!;

          return {
            convidadoId: guest.convidadoId,
            name: guest.nome,
            email: guest.email,
            role: this.mapGuestRole(guest.funcao),
            alreadyIssued: existingByConvidadoId.has(guest.convidadoId),
            issueDate: formatBahiaDate(cert.dataEmissao),
            fileUrl: cert.arquivoPdf ?? undefined,
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

    const existing =
      await this.repo.findExistingUserCertificatesByEvent(eventoId);
    const existingByUsuarioId = new Map(
      existing
        .filter((cert) => cert.arquivoPdf)
        .map((cert) => [cert.usuarioId, cert]),
    );
    const existingWithoutFileByUsuarioId = new Map(
      existing
        .filter((cert) => !cert.arquivoPdf)
        .map((cert) => [cert.usuarioId, cert]),
    );
    const pending = participacoes.filter(
      (participacao) => !existingByUsuarioId.has(participacao.usuarioId),
    );

    const dataEmissao = new Date();
    const created = await this.repo.insertUserCertificates(
      pending
        .filter(
          (participacao) =>
            !existingWithoutFileByUsuarioId.has(participacao.usuarioId),
        )
        .map((participacao) => ({
          usuarioId: participacao.usuarioId,
          eventoId,
          dataEmissao,
        })),
    );
    const createdByUsuarioId = new Map(
      created.map((cert) => [cert.usuarioId, cert]),
    );

    for (const participacao of pending) {
      const cert =
        existingWithoutFileByUsuarioId.get(participacao.usuarioId) ??
        createdByUsuarioId.get(participacao.usuarioId);
      if (!cert) continue;

      const pdf = await renderParticipantCertificatePdf({
        certificateId: cert.id,
        participantName: participacao.nome,
        role: this.mapRole(participacao.tipo),
        eventName: evento.nome,
        workloadHours: evento.cargaHoraria,
        location: evento.localizacao,
        eventDate: formatDateRange(evento.dataInicio, evento.dataFim),
        issueDate: cert.dataEmissao,
        assinante1Nome: evento.assinante1Nome ?? undefined,
        assinante1Titulo: evento.assinante1Titulo ?? undefined,
        assinante2Nome: evento.assinante2Nome ?? undefined,
        assinante2Titulo: evento.assinante2Titulo ?? undefined,
      });
      const fileUrl = await this.fileStorage.saveParticipantCertificatePdf(
        cert.id,
        evento.nome,
        participacao.nome,
        pdf,
      );
      try {
        await this.repo.setUserCertificateFile(cert.id, fileUrl);
      } catch (error) {
        await this.fileStorage.remove(fileUrl);
        throw error;
      }
      cert.arquivoPdf = fileUrl;
    }

    return {
      message: `${pending.length} certificado(s) emitido(s).`,
      data: {
        issued: pending.length,
        alreadyIssued: existingByUsuarioId.size,
        certificates: participacoes.map((participacao) => {
          const cert =
            createdByUsuarioId.get(participacao.usuarioId) ??
            existingWithoutFileByUsuarioId.get(participacao.usuarioId) ??
            existingByUsuarioId.get(participacao.usuarioId)!;

          return {
            usuarioId: participacao.usuarioId,
            name: participacao.nome,
            email: participacao.email,
            role: this.mapRole(participacao.tipo),
            alreadyIssued: existingByUsuarioId.has(participacao.usuarioId),
            issueDate: formatBahiaDate(cert.dataEmissao),
            fileUrl: cert.arquivoPdf ?? undefined,
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
  }) {
    const guest = this.isGuestRole(row.role);

    return {
      id: `${guest ? 'guest' : 'user'}-${row.id}`,
      title: row.activityTitle,
      participantName: row.participantName,
      participantEmail: row.participantEmail,
      role: guest ? this.mapGuestRole(row.role) : this.mapRole(row.role),
      hours: row.activityHours ?? undefined,
      location: row.location,
      issueDate: formatBahiaDate(row.dataEmissao),
      imageUrl: row.arquivoPdf ?? undefined,
    };
  }

  private isGuestRole(role: string): boolean {
    return ['palestrante', 'ministrante', 'moderador'].includes(
      role.toLowerCase(),
    );
  }

  private mapRole(role: string): string {
    return mapParticipantRole(role);
  }

  private mapGuestRole(funcao: string): string {
    return mapGuestRoleShared(funcao);
  }
}
