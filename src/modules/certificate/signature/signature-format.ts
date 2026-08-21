import { BAHIA_TIMEZONE } from 'src/common/helpers/bahia-date.helper';

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;

/** Aponta para a rota pública do front; CERTIFICATE_VERIFY_URL sobrescreve a base. */
export function urlVerificacao(codigo: string): string {
  const frontBase = (process.env.FRONTEND_URL ?? PUBLIC_BASE_URL).replace(
    /\/$/,
    '',
  );
  const base =
    process.env.CERTIFICATE_VERIFY_URL ?? `${frontBase}/certificate/verify`;
  return `${base.replace(/\/$/, '')}/${codigo}`;
}

export function formatarDataHoraAssinatura(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: BAHIA_TIMEZONE,
  }).format(data);
}
