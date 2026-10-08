import { Injectable } from "@nestjs/common";
import { db } from "src/db";
import {
  tabelaAtividade,
  tabelaCertificadoAtividade,
  tabelaCertificadoEvento,
  tabelaEvento,
  tabelaParticipacoes,
  tabelaUsuario,
} from "src/db/schema";
import { UpdateUserDto } from "../dto/update-user.dto";
import { UpdateProfileDto } from "../dto/update-profile.dto";
import { eq, ne, and, desc, sql } from "drizzle-orm";

// avatarUrl entrou aqui: sem isso, findById/update/findAll nunca devolviam
// a foto de perfil pro front.
const camposSeguros = {
  id:        tabelaUsuario.id,
  nome:      tabelaUsuario.nome,
  email:     tabelaUsuario.email,
  avatarUrl: tabelaUsuario.avatarUrl,
  createdAt: tabelaUsuario.createdAt,
  updatedAt: tabelaUsuario.updatedAt,
};

@Injectable()
export class UserRepository {
  async findById(id: number) {
    return db
      .select(camposSeguros)
      .from(tabelaUsuario)
      .where(eq(tabelaUsuario.id, id))
      .limit(1)
      .then(r => r[0] ?? null);
  }

  // Traz só a senha — usado exclusivamente na troca de senha,
  // por isso fica separado do findById (que só expõe campos seguros).
  async findByIdWithPassword(id: number) {
    return db
      .select({ id: tabelaUsuario.id, senha: tabelaUsuario.senha })
      .from(tabelaUsuario)
      .where(eq(tabelaUsuario.id, id))
      .limit(1)
      .then(r => r[0] ?? null);
  }

  async emailInUse(email: string, excludeId: number): Promise<boolean> {
    const found = await db
      .select({ id: tabelaUsuario.id })
      .from(tabelaUsuario)
      .where(and(
        eq(tabelaUsuario.email, email),
        ne(tabelaUsuario.id, excludeId),
      ))
      .limit(1);
    return found.length > 0;
  }

  // DTOs usam 'name' (inglês); a coluna no banco é 'nome' (português).
  // Sem esse mapeamento, o Drizzle ignora a chave 'name' silenciosamente
  // e o nome nunca é persistido.
  private mapParaColunas(data: Partial<UpdateUserDto | UpdateProfileDto>) {
    const { name, ...resto } = data as { name?: string; email?: string };
    return {
      ...resto,
      ...(name !== undefined ? { nome: name } : {}),
    };
  }

  async update(id: number, data: Partial<UpdateUserDto | UpdateProfileDto>) {
    const rows = await db
      .update(tabelaUsuario)
      .set({ ...this.mapParaColunas(data), updatedAt: new Date() })
      .where(eq(tabelaUsuario.id, id))
      .returning(camposSeguros); // Retorna avatarUrl incluso no camposSeguros
    return rows[0] ?? null;
  }

  async updatePassword(id: number, senha: string): Promise<boolean> {
    const rows = await db
      .update(tabelaUsuario)
      .set({ senha, updatedAt: new Date() })
      .where(eq(tabelaUsuario.id, id))
      .returning({ id: tabelaUsuario.id });
    return rows.length > 0;
  }

  async updateAvatar(id: number, avatarUrl: string) {
    const rows = await db
      .update(tabelaUsuario)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(tabelaUsuario.id, id))
      .returning(camposSeguros); // Retorna avatarUrl incluso no camposSeguros
    return rows[0] ?? null;
  }

  async findAll() {
    return db
      .select(camposSeguros)
      .from(tabelaUsuario)
      .orderBy(tabelaUsuario.createdAt);
  }

  async delete(id: number) {
    await db
      .delete(tabelaUsuario)
      .where(eq(tabelaUsuario.id, id));
  }

  // `exists` em vez de join: um evento com mais de um certificado assinado
  // para o mesmo usuário repetiria a linha no histórico.
  async findEventHistory(usuarioId: number) {
    return db
      .select({
        participacaoId: tabelaParticipacoes.id,
        eventoId:       tabelaEvento.id,
        nome:           tabelaEvento.nome,
        dataInicio:     tabelaEvento.dataInicio,
        dataFim:        tabelaEvento.dataFim,
        status:         tabelaEvento.status,
        cargaHoraria:   tabelaEvento.cargaHoraria,
        papel:          tabelaParticipacoes.tipo,
        possuiCertificado: sql<boolean>`exists (
          select 1 from ${tabelaCertificadoEvento}
          where ${tabelaCertificadoEvento.eventoId} = ${tabelaParticipacoes.eventoId}
            and ${tabelaCertificadoEvento.usuarioId} = ${usuarioId}
            and ${tabelaCertificadoEvento.assinado} = true
        )`,
      })
      .from(tabelaParticipacoes)
      .innerJoin(tabelaEvento, eq(tabelaEvento.id, tabelaParticipacoes.eventoId))
      .where(eq(tabelaParticipacoes.usuarioId, usuarioId))
      .orderBy(desc(tabelaEvento.dataInicio), tabelaParticipacoes.id);
  }

  // Só certificados assinados: os pendentes ainda não foram entregues ao usuário.
  async findSignedCertificateHours(usuarioId: number) {
    const [doEvento, daAtividade] = await Promise.all([
      db
        .select({ horas: tabelaEvento.cargaHoraria })
        .from(tabelaCertificadoEvento)
        .innerJoin(tabelaEvento, eq(tabelaEvento.id, tabelaCertificadoEvento.eventoId))
        .where(and(
          eq(tabelaCertificadoEvento.usuarioId, usuarioId),
          eq(tabelaCertificadoEvento.assinado, true),
        )),
      db
        .select({ horas: tabelaAtividade.cargaHoraria })
        .from(tabelaCertificadoAtividade)
        .innerJoin(tabelaAtividade, eq(tabelaAtividade.id, tabelaCertificadoAtividade.atividadeId))
        .where(and(
          eq(tabelaCertificadoAtividade.usuarioId, usuarioId),
          eq(tabelaCertificadoAtividade.assinado, true),
        )),
    ]);
    return [...doEvento, ...daAtividade].map(row => row.horas);
  }
}
