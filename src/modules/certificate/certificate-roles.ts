// src/modules/certificate/certificate-roles.ts
//
// Tradução dos papéis do banco para o rótulo impresso no certificado.
// Fica aqui porque emissão, assinatura em lote e geração sob demanda precisam
// imprimir exatamente o mesmo rótulo — três cópias divergiriam.

const PARTICIPANTE: Record<string, string> = {
  participante: 'Ouvinte',
  monitor: 'Monitor',
  organizador: 'Organizador',
};

const CONVIDADO: Record<string, string> = {
  palestrante: 'Palestrante',
  ministrante: 'Ministrante',
  moderador: 'Moderador',
};

export function mapParticipantRole(role: string): string {
  return PARTICIPANTE[role.toLowerCase()] ?? role;
}

export function mapGuestRole(funcao: string): string {
  return CONVIDADO[funcao.toLowerCase()] ?? funcao;
}
