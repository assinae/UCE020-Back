// src/modules/certificate/certificate-pdf.service.ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CertificateRepository } from './repository/certificate.respository';
import { renderParticipantCertificatePdf } from './pdf/participant-certificate.pdf';
import { renderGuestCertificatePdf } from './pdf/guest-certificate.pdf';
import { formatDateRange } from './pdf/format-date-range';
import { parseCertificateId } from './certificate-id';
import { mapGuestRole, mapParticipantRole } from './certificate-roles';
import { gerarQrPng } from './signature/qr';
import {
  formatarDataHoraAssinatura,
  urlVerificacao,
} from './signature/signature-format';

/** Dados de assinatura tal como estão gravados no certificado. */
interface EstadoAssinatura {
  assinado: boolean;
  assinadoEm: Date | null;
  assinaturaNome: string | null;
  codigoVerificacao: string | null;
}

export interface CertificadoPdf {
  buffer: Buffer;
  filename: string;
}

/**
 * Gera o PDF do certificado sob demanda, a partir do banco.
 *
 * Não lê nem escreve arquivo: tudo que o template precisa (dados do evento,
 * do titular e da assinatura) já está em colunas, então o PDF é derivado no
 * momento do download. Isso mantém o documento sempre coerente com o banco —
 * ao contrário do arquivo salvo, que congela no estado da emissão.
 */
@Injectable()
export class CertificatePdfService {
  constructor(private readonly repo: CertificateRepository) {}

  async buildCertificatePdf(
    rawId: string,
    userId: number,
  ): Promise<CertificadoPdf> {
    const { kind, certificateId } = parseCertificateId(rawId);

    return kind === 'guest'
      ? this.buildGuestCertificate(certificateId, userId)
      : this.buildParticipantCertificate(certificateId, userId);
  }

  private async buildParticipantCertificate(
    certificateId: number,
    userId: number,
  ): Promise<CertificadoPdf> {
    const cert = await this.repo.findEventCertificateForRender(certificateId);
    if (!cert) {
      throw new NotFoundException('Certificado não encontrado.');
    }

    // O dono baixa o próprio certificado direto; qualquer outra pessoa
    // precisa ser organizadora do evento.
    if (cert.usuarioId !== userId) {
      await this.assertOrganizador(userId, cert.eventoId);
    }

    const buffer = await renderParticipantCertificatePdf({
      certificateId: cert.id,
      participantName: cert.participantName,
      role: mapParticipantRole(cert.role),
      eventName: cert.eventName,
      workloadHours: cert.workloadHours,
      location: cert.location,
      eventDate: formatDateRange(cert.dataInicio, cert.dataFim),
      issueDate: cert.dataEmissao,
      assinante1Nome: cert.assinante1Nome ?? undefined,
      assinante1Titulo: cert.assinante1Titulo ?? undefined,
      assinante2Nome: cert.assinante2Nome ?? undefined,
      assinante2Titulo: cert.assinante2Titulo ?? undefined,
      assinatura: await this.montarAssinatura(cert),
    });

    return {
      buffer,
      filename: `Certificado - ${cert.participantName} - ${cert.eventName}.pdf`,
    };
  }

  private async buildGuestCertificate(
    certificateId: number,
    userId: number,
  ): Promise<CertificadoPdf> {
    const cert = await this.repo.findGuestCertificateForRender(certificateId);
    if (!cert) {
      throw new NotFoundException('Certificado não encontrado.');
    }

    // Convidado não é usuário do sistema, então não existe "dono" que possa
    // baixar: só organizador do evento.
    await this.assertOrganizador(userId, cert.eventoId);

    const buffer = await renderGuestCertificatePdf({
      certificateId: cert.id,
      guestName: cert.guestName,
      role: mapGuestRole(cert.role),
      eventName: cert.eventName,
      activityName: cert.activityName,
      workloadHours: cert.workloadHours,
      location: cert.location,
      eventDate: formatDateRange(cert.dataInicio, cert.dataFim),
      issueDate: cert.dataEmissao,
      assinante1Nome: cert.assinante1Nome ?? undefined,
      assinante1Titulo: cert.assinante1Titulo ?? undefined,
      assinante2Nome: cert.assinante2Nome ?? undefined,
      assinante2Titulo: cert.assinante2Titulo ?? undefined,
      assinatura: await this.montarAssinatura(cert),
    });

    return {
      buffer,
      filename: `Certificado Convidado - ${cert.guestName} - ${cert.activityName}.pdf`,
    };
  }

  /**
   * Checagem própria em vez do assertEventOrganizer compartilhado: o helper
   * tem um bug conhecido (o adminCheck é um array, sempre truthy) e nunca
   * lança. Como esta rota entrega o documento pessoal de outra pessoa, ela
   * precisa bloquear de verdade.
   */
  private async assertOrganizador(userId: number, eventoId: number) {
    if (!(await this.repo.isEventOrganizer(userId, eventoId))) {
      throw new ForbiddenException(
        'Apenas o titular ou um organizador do evento pode baixar este certificado.',
      );
    }
  }

  /**
   * Reconstrói o bloco de assinatura a partir das colunas gravadas. O QR é
   * regerado do codigo_verificacao — o mesmo código produz sempre o mesmo QR.
   * Se o certificado ainda não foi assinado, devolve undefined e o template
   * renderiza sem o bloco, igual ao PDF da emissão.
   */
  private async montarAssinatura(cert: EstadoAssinatura) {
    if (!cert.assinado || !cert.assinadoEm || !cert.codigoVerificacao) {
      return undefined;
    }

    const qr = await gerarQrPng(urlVerificacao(cert.codigoVerificacao));

    return {
      nome: cert.assinaturaNome ?? 'Organizador',
      data: formatarDataHoraAssinatura(cert.assinadoEm),
      codigo: cert.codigoVerificacao,
      qr: qr ? { data: qr, format: 'png' as const } : undefined,
    };
  }
}
