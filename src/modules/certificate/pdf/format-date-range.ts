// src/modules/certificate/pdf/format-date-range.ts

export function formatDateRange(dataInicio: Date, dataFim: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Bahia',
  };
  const inicio = new Date(dataInicio).toLocaleDateString('pt-BR', options);
  const fim = new Date(dataFim).toLocaleDateString('pt-BR', options);

  return inicio === fim ? inicio : `${inicio} a ${fim}`;
}
