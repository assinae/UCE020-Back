// src/modules/certificate/signature/certificate-signature.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { assertEventOrganizer } from 'src/common/helpers/assert-event-organizer.helper';
import { CertificateRepository } from '../repository/certificate.respository';
import { gerarAssinatura, normalizarCodigo } from './verification-hash';
import { formatBahiaDate } from 'src/common/helpers/bahia-date.helper';

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

    const [eventoCerts, convidadoCerts, atividadeCerts] = await Promise.all([
      this.repo.findEventCertificatesToSign(eventoId, force),
      this.repo.findGuestCertificatesToSign(eventoId, force),
      this.repo.findActivityCertificatesToSign(eventoId, force),
    ]);

    const total =
      eventoCerts.length + convidadoCerts.length + atividadeCerts.length;
    if (total === 0) {
      throw new NotFoundException(
        force
          ? 'Nenhum certificado encontrado para este evento.'
          : 'Nenhum certificado pendente de assinatura para este evento.',
      );
    }

    const resultados: {
      tipo: 'evento' | 'convidado' | 'atividade';
      certificadoId: number;
      titular: string;
      codigoVerificacao: string;
    }[] = [];

    const assinadoEm = new Date();
    const comuns = {
      assinadoEm,
      assinadoPor: userId,
      assinaturaNome: assinanteNome,
    };

    const assinaturasEvento = eventoCerts.map((cert) => {
      const { codigo, hash } = gerarAssinatura({
        tipo: 'evento',
        certificadoId: cert.id,
        titularNome: cert.participantName,
        dataEmissao: cert.dataEmissao,
      });

      resultados.push({
        tipo: 'evento',
        certificadoId: cert.id,
        titular: cert.participantName,
        codigoVerificacao: codigo,
      });

      return { id: cert.id, codigoVerificacao: codigo, hashVerificacao: hash };
    });

    const assinaturasAtividade = atividadeCerts.map((cert) => {
      const { codigo, hash } = gerarAssinatura({
        tipo: 'atividade',
        certificadoId: cert.id,
        titularNome: cert.participantName,
        dataEmissao: cert.dataEmissao,
      });

      resultados.push({
        tipo: 'atividade',
        certificadoId: cert.id,
        titular: cert.participantName,
        codigoVerificacao: codigo,
      });

      return { id: cert.id, codigoVerificacao: codigo, hashVerificacao: hash };
    });

    const assinaturasConvidado = convidadoCerts.map((cert) => {
      const { codigo, hash } = gerarAssinatura({
        tipo: 'convidado',
        certificadoId: cert.id,
        titularNome: cert.guestName,
        dataEmissao: cert.dataEmissao,
      });

      resultados.push({
        tipo: 'convidado',
        certificadoId: cert.id,
        titular: cert.guestName,
        codigoVerificacao: codigo,
      });

      return { id: cert.id, codigoVerificacao: codigo, hashVerificacao: hash };
    });

    await Promise.all([
      this.repo.setEventCertificateSignatures(assinaturasEvento, comuns),
      this.repo.setActivityCertificateSignatures(assinaturasAtividade, comuns),
      this.repo.setGuestCertificateSignatures(assinaturasConvidado, comuns),
    ]);

    const assinados =
      assinaturasEvento.length +
      assinaturasAtividade.length +
      assinaturasConvidado.length;

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
