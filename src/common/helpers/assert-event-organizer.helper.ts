import { ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from 'src/db';
import { tabelaParticipacoes } from 'src/db/schema';

export async function assertEventOrganizer(userId: number, eventId: number) {
  const [participacao] = await db
    .select({ id: tabelaParticipacoes.id })
    .from(tabelaParticipacoes)
    .where(
      and(
        eq(tabelaParticipacoes.usuarioId, userId),
        eq(tabelaParticipacoes.eventoId, eventId),
        eq(tabelaParticipacoes.tipo, 'organizador'),
      ),
    );

  if (!participacao) {
    throw new ForbiddenException(
      'Apenas organizadores podem realizar esta ação.',
    );
  }
}