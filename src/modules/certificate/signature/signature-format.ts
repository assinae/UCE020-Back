// src/modules/certificate/signature/signature-format.ts
//
// Formatações do bloco de assinatura, compartilhadas entre a assinatura em
// lote e a geração de PDF sob demanda. Vivem fora do service porque os dois
// caminhos precisam produzir exatamente o mesmo QR e a mesma data: se as
// implementações divergirem, o mesmo certificado sai diferente em cada um.

import { BAHIA_TIMEZONE } from 'src/common/helpers/bahia-date.helper';

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;

/**
 * URL embutida no QR Code. Aponta para a rota pública do front
 * ({FRONTEND_URL}/certificate/verify/{codigo}), e pode ser sobrescrita
 * por CERTIFICATE_VERIFY_URL.
 */
export function urlVerificacao(codigo: string): string {
  const frontBase = (process.env.FRONTEND_URL ?? PUBLIC_BASE_URL).replace(
    /\/$/,
    '',
  );
  const base =
    process.env.CERTIFICATE_VERIFY_URL ?? `${frontBase}/certificate/verify`;
  return `${base.replace(/\/$/, '')}/${codigo}`;
}

/** Data/hora da assinatura estampada no PDF. */
export function formatarDataHoraAssinatura(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: BAHIA_TIMEZONE,
  }).format(data);
}
