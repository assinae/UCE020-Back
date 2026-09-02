// src/modules/certificate/pdf/format-date-range.ts
import { BAHIA_TIMEZONE } from 'src/common/helpers/bahia-date.helper';

/**
 * Data no formato dd/mm/aaaa, sempre no fuso da Bahia.
 *
 * Sem passar timeZone explícito, toLocaleDateString usa o fuso da máquina e a
 * data impressa muda conforme onde o PDF é gerado: em produção (servidor em
 * UTC) uma emissão feita depois das 21h no horário local sai com a data do dia
 * seguinte. Fixar o fuso torna o documento determinístico.
 */
export function formatDate(data: Date): string {
  return new Date(data).toLocaleDateString('pt-BR', {
    timeZone: BAHIA_TIMEZONE,
  });
}

export function formatDateRange(dataInicio: Date, dataFim: Date): string {
  const inicio = formatDate(dataInicio);
  const fim = formatDate(dataFim);

  return inicio === fim ? inicio : `${inicio} - ${fim}`;
}
