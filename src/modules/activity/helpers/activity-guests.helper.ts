import { and, eq, inArray, notExists, sql } from 'drizzle-orm';
import { db } from 'src/db';
import {
  funcaoConvidadoEnum,
  tabelaCertificadoConvidado,
  tabelaConvidado,
  tabelaConvidadoAtividade,
} from 'src/db/schema';

/**
 * `db` ou a transação recebida em `db.transaction(...)`.
 * Ambos expõem a mesma API de query do Drizzle.
 */
export type DbExecutor =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FuncaoConvidado = (typeof funcaoConvidadoEnum.enumValues)[number];

export type GuestInput = {
  name: string;
  email: string;
  role: FuncaoConvidado;
};

type NormalizedGuest = {
  nome: string;
  email: string;
  funcao: FuncaoConvidado;
};

/**
 * Remove os convidados informados que não estão mais vinculados a nenhuma
 * atividade e não possuem certificado emitido — ou seja, que ficaram órfãos
 * depois que uma atividade/evento foi apagado.
 */
export async function removeOrphanGuests(
  executor: DbExecutor,
  guestIds: number[],
): Promise<void> {
  const ids = [...new Set(guestIds)];

  if (ids.length === 0) return;

  await executor.delete(tabelaConvidado).where(
    and(
      inArray(tabelaConvidado.id, ids),
      notExists(
        executor
          .select({ existe: sql`1` })
          .from(tabelaConvidadoAtividade)
          .where(eq(tabelaConvidadoAtividade.convidadoId, tabelaConvidado.id)),
      ),
      notExists(
        executor
          .select({ existe: sql`1` })
          .from(tabelaCertificadoConvidado)
          .where(
            eq(tabelaCertificadoConvidado.convidadoId, tabelaConvidado.id),
          ),
      ),
    ),
  );
}

/** IDs dos convidados vinculados às atividades informadas. */
export async function findGuestIdsByActivities(
  executor: DbExecutor,
  activityIds: number[],
): Promise<number[]> {
  if (activityIds.length === 0) return [];

  const rows = await executor
    .select({ convidadoId: tabelaConvidadoAtividade.convidadoId })
    .from(tabelaConvidadoAtividade)
    .where(inArray(tabelaConvidadoAtividade.atividadeId, activityIds));

  return [...new Set(rows.map((row) => row.convidadoId))];
}

function normalizeGuests(guests: GuestInput[]): NormalizedGuest[] {
  const seen = new Set<string>();
  const normalized: NormalizedGuest[] = [];

  for (const guest of guests) {
    const email = guest.email.trim().toLowerCase();
    const nome = guest.name.trim();

    if (!email || !nome || seen.has(email)) continue;

    seen.add(email);
    normalized.push({ nome, email, funcao: guest.role });
  }

  return normalized;
}

/**
 * Sincroniza a lista de convidados de uma atividade:
 * - cria (ou reaproveita, pelo e-mail) o registro em `convidado`;
 * - cria/atualiza o vínculo em `convidado_atividade` com a função;
 * - remove os vínculos que não vieram na lista e limpa os convidados órfãos.
 */
export async function syncActivityGuests(
  executor: DbExecutor,
  activityId: number,
  guests: GuestInput[],
): Promise<void> {
  const normalized = normalizeGuests(guests);

  const previousLinks = await executor
    .select({ convidadoId: tabelaConvidadoAtividade.convidadoId })
    .from(tabelaConvidadoAtividade)
    .where(eq(tabelaConvidadoAtividade.atividadeId, activityId));

  const previousIds = previousLinks.map((link) => link.convidadoId);
  const keptIds: number[] = [];

  for (const guest of normalized) {
    const [convidado] = await executor
      .insert(tabelaConvidado)
      .values({ nome: guest.nome, email: guest.email })
      .onConflictDoUpdate({
        target: tabelaConvidado.email,
        set: { nome: guest.nome },
      })
      .returning({ id: tabelaConvidado.id });

    if (!convidado) continue;

    keptIds.push(convidado.id);

    const [existingLink] = await executor
      .select()
      .from(tabelaConvidadoAtividade)
      .where(
        and(
          eq(tabelaConvidadoAtividade.atividadeId, activityId),
          eq(tabelaConvidadoAtividade.convidadoId, convidado.id),
        ),
      )
      .limit(1);

    if (!existingLink) {
      await executor.insert(tabelaConvidadoAtividade).values({
        atividadeId: activityId,
        convidadoId: convidado.id,
        funcao: guest.funcao,
      });
    } else if (existingLink.funcao !== guest.funcao) {
      await executor
        .update(tabelaConvidadoAtividade)
        .set({ funcao: guest.funcao })
        .where(eq(tabelaConvidadoAtividade.id, existingLink.id));
    }
  }

  const removedIds = previousIds.filter((id) => !keptIds.includes(id));

  if (removedIds.length > 0) {
    await executor
      .delete(tabelaCertificadoConvidado)
      .where(
        and(
          eq(tabelaCertificadoConvidado.atividadeId, activityId),
          inArray(tabelaCertificadoConvidado.convidadoId, removedIds),
        ),
      );

    await executor
      .delete(tabelaConvidadoAtividade)
      .where(
        and(
          eq(tabelaConvidadoAtividade.atividadeId, activityId),
          inArray(tabelaConvidadoAtividade.convidadoId, removedIds),
        ),
      );

    await removeOrphanGuests(executor, removedIds);
  }
}

/** Convidados de uma atividade, no formato usado pelo front. */
export async function findActivityGuests(
  executor: DbExecutor,
  activityId: number,
): Promise<Array<{ id: number; name: string; email: string; role: string }>> {
  const rows = await executor
    .select({
      id: tabelaConvidado.id,
      name: tabelaConvidado.nome,
      email: tabelaConvidado.email,
      role: tabelaConvidadoAtividade.funcao,
    })
    .from(tabelaConvidadoAtividade)
    .innerJoin(
      tabelaConvidado,
      eq(tabelaConvidado.id, tabelaConvidadoAtividade.convidadoId),
    )
    .where(eq(tabelaConvidadoAtividade.atividadeId, activityId));

  return rows;
}
