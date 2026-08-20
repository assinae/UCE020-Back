// src/modules/certificate/pdf/format-date-range.ts

/**
 * Fuso usado em toda data impressa no certificado.
 *
 * Sem passar timeZone explícito, toLocaleDateString usa o fuso da máquina e a
 * data impressa muda conforme onde o PDF é gerado: em produção (servidor em
 * UTC) uma emissão feita depois das 21h no horário de Brasília sai com a data
 * do dia seguinte. Fixar o fuso torna o documento determinístico.
 */
export const FUSO_CERTIFICADO = 'America/Sao_Paulo';

/** Data no formato dd/mm/aaaa, sempre no fuso do certificado. */
export function formatDate(data: Date): string {
  return new Date(data).toLocaleDateString('pt-BR', {
    timeZone: FUSO_CERTIFICADO,
  });
}

export function formatDateRange(dataInicio: Date, dataFim: Date): string {
  const inicio = formatDate(dataInicio);
  const fim = formatDate(dataFim);

  return inicio === fim ? inicio : `${inicio} a ${fim}`;
}
