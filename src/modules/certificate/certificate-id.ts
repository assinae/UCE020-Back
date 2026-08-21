// src/modules/certificate/certificate-id.ts
import { NotFoundException } from '@nestjs/common';

export type CertificateKind = 'user' | 'guest';

/**
 * Ids de certificado circulam como "user-45" / "guest-12": participante e
 * convidado vivem em tabelas separadas e podem repetir o mesmo id numérico,
 * então o prefixo é o que diz em qual tabela procurar.
 */
export function parseCertificateId(rawId: string): {
  kind: CertificateKind;
  certificateId: number;
} {
  const [kind, idPart] = rawId.split('-');
  const certificateId = Number(idPart);

  if (
    (kind !== 'guest' && kind !== 'user') ||
    !Number.isInteger(certificateId)
  ) {
    throw new NotFoundException('Certificado não encontrado.');
  }

  return { kind, certificateId };
}
