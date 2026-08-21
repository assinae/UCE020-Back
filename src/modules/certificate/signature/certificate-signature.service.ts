// src/modules/certificate/signature/certificate-signature.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { assertEventOrganizer } from 'src/common/helpers/assert-event-organizer.helper';
import { CertificateRepository } from '../repository/certificate.respository';
import { gerarAssinatura, normalizarCodigo } from './verification-hash';

@Injectable()
export class CertificateSignatureService {
  constructor(private readonly repo: CertificateRepository) {}

  /**
   * Assina EM LOTE os certificados do evento (participantes + convidados).
   *
   * @param force reassina os já assinados, gerando código e hash novos — o que
   * invalida os QR Codes já distribuídos.
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
    const resultados: {
      tipo: 'evento' | 'convidado';
      certificadoId: number;
      titular: string;
      codigoVerificacao: string;
    }[] = [];

    const assinadoEm = new Date();

    for (const cert of eventoCerts) {
      const { codigo, hash } = gerarAssinatura({
        tipo: 'evento',
        certificadoId: cert.id,
        titularNome: cert.participantName,
        dataEmissao: cert.dataEmissao,
      });

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

    for (const cert of convidadoCerts) {
      const { codigo, hash } = gerarAssinatura({
        tipo: 'convidado',
        certificadoId: cert.id,
        titularNome: cert.guestName,
        dataEmissao: cert.dataEmissao,
      });

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
        emitidoEm: cert.dataEmissao.toISOString(),
        assinadoEm: cert.assinadoEm.toISOString(),
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
