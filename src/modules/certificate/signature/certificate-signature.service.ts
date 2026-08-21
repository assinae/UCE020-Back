// src/modules/certificate/signature/certificate-signature.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { assertEventOrganizer } from 'src/common/helpers/assert-event-organizer.helper';
import { CertificateRepository } from '../repository/certificate.respository';
import { CertificateFileStorageService } from '../storage/certificate-file-storage.service';
import { renderParticipantCertificatePdf } from '../pdf/participant-certificate.pdf';
import { renderGuestCertificatePdf } from '../pdf/guest-certificate.pdf';
import { formatDateRange } from '../pdf/format-date-range';
import { gerarAssinatura, normalizarCodigo } from './verification-hash';
import { gerarQrPng } from './qr';
import { formatarDataHoraAssinatura, urlVerificacao } from './signature-format';
import { mapGuestRole, mapParticipantRole } from '../certificate-roles';
import { formatBahiaDate } from 'src/common/helpers/bahia-date.helper';

@Injectable()
export class CertificateSignatureService {
  constructor(
    private readonly repo: CertificateRepository,
    private readonly fileStorage: CertificateFileStorageService,
  ) {}

  /**
   * Assina EM LOTE os certificados do evento (participantes + convidados).
   * A assinatura é embutida re-renderizando o PDF, ficando centralizada no
   * corpo do certificado (logo do sistema + nome de quem assina + data + QR).
   *
   * @param force quando true, reassina também os já assinados (regera o PDF).
   */
  async signEventCertificates(eventoId: number, userId: number, force = false) {
    await assertEventOrganizer(userId, eventoId);

    const assinanteNome =
      (await this.repo.findUsuarioNome(userId)) ?? 'Organizador';

    const [eventoCerts, convidadoCerts] = await Promise.all([
      this.repo.findEventCertificatesToSign(eventoId, force),
      this.repo.findGuestCertificatesToSign(eventoId, force),
    ]);

    const total = eventoCerts.length + convidadoCerts.length;
    if (total === 0) {
      throw new NotFoundException(
        force
          ? 'Nenhum certificado encontrado para este evento.'
          : 'Nenhum certificado pendente de assinatura para este evento.',
      );
    }

    let assinados = 0;
    let semArquivo = 0;
    const resultados: {
      tipo: 'evento' | 'convidado';
      certificadoId: number;
      titular: string;
      codigoVerificacao: string;
    }[] = [];

    // ---- Certificados de participante ----
    for (const cert of eventoCerts) {
      if (!cert.arquivoPdf) {
        semArquivo++;
        continue;
      }

      const { codigo, hash } = gerarAssinatura({
        tipo: 'evento',
        certificadoId: cert.id,
        titularNome: cert.participantName,
        dataEmissao: cert.dataEmissao,
      });
      const assinadoEm = new Date();
      const qr = await gerarQrPng(urlVerificacao(codigo));

      const pdf = await renderParticipantCertificatePdf({
        certificateId: cert.id,
        participantName: cert.participantName,
        role: mapParticipantRole(cert.role),
        eventName: cert.eventName,
        workloadHours: cert.workloadHours,
        location: cert.location,
        eventDate: formatDateRange(cert.dataInicio, cert.dataFim),
        issueDate: cert.dataEmissao,
        assinatura: {
          nome: assinanteNome,
          data: formatarDataHoraAssinatura(assinadoEm),
          codigo,
          qr: qr ? { data: qr, format: 'png' } : undefined,
        },
      });

      // Supabase gera um objeto novo a cada upload: subimos o PDF assinado,
      // atualizamos a URL no banco e removemos o arquivo antigo do bucket.
      const novaUrl = await this.fileStorage.saveParticipantCertificatePdf(
        cert.id,
        cert.eventName,
        cert.participantName,
        pdf,
      );
      try {
        await this.repo.setUserCertificateFile(cert.id, novaUrl);
      } catch (error) {
        await this.fileStorage.remove(novaUrl);
        throw error;
      }
      if (cert.arquivoPdf && cert.arquivoPdf !== novaUrl) {
        await this.fileStorage.remove(cert.arquivoPdf);
      }
      await this.repo.setEventCertificateSignature(cert.id, {
        assinadoEm,
        assinadoPor: userId,
        assinaturaNome: assinanteNome,
        codigoVerificacao: codigo,
        hashVerificacao: hash,
      });

      assinados++;
      resultados.push({
        tipo: 'evento',
        certificadoId: cert.id,
        titular: cert.participantName,
        codigoVerificacao: codigo,
      });
    }

    // ---- Certificados de convidado ----
    for (const cert of convidadoCerts) {
      if (!cert.arquivoPdf) {
        semArquivo++;
        continue;
      }

      const { codigo, hash } = gerarAssinatura({
        tipo: 'convidado',
        certificadoId: cert.id,
        titularNome: cert.guestName,
        dataEmissao: cert.dataEmissao,
      });
      const assinadoEm = new Date();
      const qr = await gerarQrPng(urlVerificacao(codigo));

      const pdf = await renderGuestCertificatePdf({
        certificateId: cert.id,
        guestName: cert.guestName,
        role: mapGuestRole(cert.role),
        eventName: cert.eventName,
        activityName: cert.activityName,
        workloadHours: cert.workloadHours,
        location: cert.location,
        eventDate: formatDateRange(cert.dataInicio, cert.dataFim),
        issueDate: cert.dataEmissao,
        assinatura: {
          nome: assinanteNome,
          data: formatarDataHoraAssinatura(assinadoEm),
          codigo,
          qr: qr ? { data: qr, format: 'png' } : undefined,
        },
      });

      const novaUrl = await this.fileStorage.saveGuestCertificatePdf(
        cert.id,
        cert.guestName,
        cert.activityName,
        pdf,
      );
      try {
        await this.repo.setGuestCertificateFile(cert.id, novaUrl);
      } catch (error) {
        await this.fileStorage.remove(novaUrl);
        throw error;
      }
      if (cert.arquivoPdf && cert.arquivoPdf !== novaUrl) {
        await this.fileStorage.remove(cert.arquivoPdf);
      }
      await this.repo.setGuestCertificateSignature(cert.id, {
        assinadoEm,
        assinadoPor: userId,
        assinaturaNome: assinanteNome,
        codigoVerificacao: codigo,
        hashVerificacao: hash,
      });

      assinados++;
      resultados.push({
        tipo: 'convidado',
        certificadoId: cert.id,
        titular: cert.guestName,
        codigoVerificacao: codigo,
      });
    }

    return {
      message: `${assinados} certificado(s) assinado(s) em lote.`,
      data: {
        assinados,
        semArquivo,
        reassinatura: force,
        assinante: assinanteNome,
        certificados: resultados,
      },
    };
  }

  /** Verificação pública de autenticidade de um certificado pelo código. */
  async verify(codigoBruto: string) {
    const codigo = this.reformatar(normalizarCodigo(codigoBruto));
    const cert = await this.repo.findByVerificationCode(codigo);

    if (!cert || !cert.assinadoEm) {
      return {
        valido: false,
        message: 'Certificado não encontrado ou não assinado.',
      };
    }

    return {
      valido: true,
      message: 'Certificado autêntico e assinado digitalmente.',
      data: {
        tipo: cert.tipo,
        titular: cert.titular,
        referente: cert.contexto,
        emitidoEm: formatBahiaDate(cert.dataEmissao),
        assinadoEm: formatBahiaDate(cert.assinadoEm),
        assinadoPor: cert.assinaturaNome,
        hash: cert.hashVerificacao,
      },
    };
  }

  /** Re-insere os hífens no formato "XXXX-XXXX-XXXX". */
  private reformatar(codigoLimpo: string): string {
    return codigoLimpo.match(/.{1,4}/g)?.join('-') ?? codigoLimpo;
  }
}
