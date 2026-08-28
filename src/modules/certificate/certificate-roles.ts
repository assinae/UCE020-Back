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
