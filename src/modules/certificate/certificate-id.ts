import { NotFoundException } from '@nestjs/common';

export type CertificateKind = 'user' | 'guest';

/**
 * Participante e convidado vivem em tabelas separadas e podem repetir o mesmo
 * id numérico, por isso o id circula prefixado: "user-45" / "guest-12".
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
