import { createHash } from 'node:crypto';
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
import { PdfCache } from './pdf-cache';
import {
  formatarDataHoraAssinatura,
  urlVerificacao,
} from './signature/signature-format';
import { resolveCertificateTemplateUrl } from './pdf/certificate-template';

interface EstadoAssinatura {
  assinado: boolean;
  assinadoEm: Date | null;
  assinaturaNome: string | null;
  codigoVerificacao: string | null;
}

export interface CertificadoPdfPreparado {
  /** Muda sempre que muda algo impresso no PDF. Serve de ETag e de chave de cache. */
  etag: string;
  filename: string;
  render: () => Promise<Buffer>;
}

/**
 * Teto do cache, em MB, ajustável por `CERTIFICATE_PDF_CACHE_MB`.
 *
 * O default é conservador de propósito: o pico de RSS medido sob carga fria foi
 * de ~400 MB, e o cache soma em cima disso. Com 16 MB (~135 PDFs de 118 kB) o
 * pior caso fica em ~420 MB, o que cabe num container de 512 MB. Instância com
 * mais memória pode subir esse número — o ganho do cache satura rápido, porque
 * o conjunto de certificados ativos num evento real é bem menor que 135.
 */
function tetoCacheMb(): number {
  const bruto = process.env.CERTIFICATE_PDF_CACHE_MB;
  // Vazio e ausente caem no default; 0 explícito desliga o cache.
  if (bruto === undefined || bruto.trim() === '') return 16;

  const mb = Number(bruto);
  return Number.isFinite(mb) && mb >= 0 ? mb : 16;
}

const LIMITE_CACHE_BYTES = tetoCacheMb() * 1024 * 1024;

/** Monta o PDF no momento do download, a partir das colunas do banco. */
@Injectable()
export class CertificatePdfService {
  private readonly cache = new PdfCache(LIMITE_CACHE_BYTES);

  constructor(private readonly repo: CertificateRepository) {}

  /**
   * Resolve identidade e permissão numa consulta só e devolve o render adiado.
   * Quem chama decide se precisa do PDF: com ETag conferido, uma revalidação
   * custa essa consulta em vez dos ~400ms de CPU da renderização.
   */
  async prepareCertificatePdf(
    rawId: string,
    userId: number,
  ): Promise<CertificadoPdfPreparado> {
    const { kind, certificateId } = parseCertificateId(rawId);

    if (kind === 'guest') {
      return this.prepareGuestCertificate(certificateId, userId);
    }

    if (kind === 'activity') {
      return this.prepareActivityCertificate(certificateId, userId);
    }

    return this.prepareParticipantCertificate(certificateId, userId);
  }

  private async prepareParticipantCertificate(
    certificateId: number,
    userId: number,
  ): Promise<CertificadoPdfPreparado> {
    const cert = await this.repo.findEventCertificateForRender(certificateId);
    if (!cert) {
      throw new NotFoundException('Certificado não encontrado.');
    }

    if (cert.usuarioId !== userId) {
      await this.assertOrganizador(userId, cert.eventoId);
    }

    const dados = {
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
      templateUrl: resolveCertificateTemplateUrl({
        templateUrl: cert.templateUrl,
        certificadoTemplate: cert.certificadoTemplate,
        template: cert.template,
      }),
      textos: {
        titulo: cert.certificadoTitulo,
        subtitulo: cert.certificadoSubtitulo,
        descricaoInicio: cert.certificadoDescricaoInicio,
        descricaoEvento: cert.certificadoDescricaoEvento,
        descricaoCargaHoraria: cert.certificadoDescricaoCargaHoraria,
      },
    };

    const etag = this.calcularEtag('user', dados, cert);

    return {
      etag,
      filename: `Certificado - ${cert.participantName} - ${cert.eventName}.pdf`,
      render: () =>
        this.renderComCache(etag, async () =>
          renderParticipantCertificatePdf({
            ...dados,
            assinatura: await this.montarAssinatura(cert),
          }),
        ),
    };
  }

  private async prepareGuestCertificate(
    certificateId: number,
    userId: number,
  ): Promise<CertificadoPdfPreparado> {
    const cert = await this.repo.findGuestCertificateForRender(certificateId);
    if (!cert) {
      throw new NotFoundException('Certificado não encontrado.');
    }

    // Convidado não é usuário do sistema: não há "dono" que possa baixar.
    await this.assertOrganizador(userId, cert.eventoId);

    const dados = {
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
      templateUrl: resolveCertificateTemplateUrl({
        templateUrl: cert.templateUrl,
        certificadoTemplate: cert.certificadoTemplate,
        template: cert.template,
      }),
    };

    const etag = this.calcularEtag('guest', dados, cert);

    return {
      etag,
      filename: `Certificado Convidado - ${cert.guestName} - ${cert.activityName}.pdf`,
      render: () =>
        this.renderComCache(etag, async () =>
          renderGuestCertificatePdf({
            ...dados,
            assinatura: await this.montarAssinatura(cert),
          }),
        ),
    };
  }

  private async prepareActivityCertificate(
    certificateId: number,
    userId: number,
  ): Promise<CertificadoPdfPreparado> {
    const cert =
      await this.repo.findActivityCertificateForRender(certificateId);
    if (!cert) {
      throw new NotFoundException('Certificado não encontrado.');
    }

    if (cert.usuarioId !== userId) {
      await this.assertOrganizador(userId, cert.eventoId);
    }

    const dados = {
      certificateId: cert.id,
      participantName: cert.participantName,
      role: mapParticipantRole(cert.role),
      // renderParticipantCertificatePdf só tem um campo de "nome do contexto" —
      // pra atividade, o certificado é sobre a atividade, não o evento inteiro.
      eventName: cert.activityName,
      contextLabel: 'atividade' as const,
      workloadHours: cert.workloadHours,
      location: cert.location,
      eventDate: formatDateRange(cert.dataInicio, cert.dataFim),
      issueDate: cert.dataEmissao,
      assinante1Nome: cert.assinante1Nome ?? undefined,
      assinante1Titulo: cert.assinante1Titulo ?? undefined,
      assinante2Nome: cert.assinante2Nome ?? undefined,
      assinante2Titulo: cert.assinante2Titulo ?? undefined,
      templateUrl: resolveCertificateTemplateUrl({
        templateUrl: cert.templateUrl,
        certificadoTemplate: cert.certificadoTemplate,
        template: cert.template,
      }),
    };

    const etag = this.calcularEtag('activity', dados, cert);

    return {
      etag,
      filename: `Certificado Atividade - ${cert.participantName} - ${cert.activityName}.pdf`,
      render: () =>
        this.renderComCache(etag, async () =>
          renderParticipantCertificatePdf({
            ...dados,
            assinatura: await this.montarAssinatura(cert),
          }),
        ),
    };
  }

  private async renderComCache(
    etag: string,
    renderizar: () => Promise<Buffer>,
  ): Promise<Buffer> {
    const cacheado = this.cache.get(etag);
    if (cacheado) return cacheado;

    const buffer = await renderizar();
    this.cache.set(etag, buffer);

    return buffer;
  }

  /**
   * Hash de tudo que aparece no papel, incluindo o estado da assinatura. Datas
   * viram ISO no JSON.stringify, então o resultado é estável entre processos.
   */
  private calcularEtag(
    tipo: 'user' | 'guest' | 'activity',
    dados: object,
    assinatura: EstadoAssinatura,
  ): string {
    const conteudo = JSON.stringify({
      tipo,
      dados,
      assinatura: {
        assinado: assinatura.assinado,
        assinadoEm: assinatura.assinadoEm,
        assinaturaNome: assinatura.assinaturaNome,
        codigoVerificacao: assinatura.codigoVerificacao,
      },
    });

    return `"${createHash('sha256').update(conteudo).digest('base64url')}"`;
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
