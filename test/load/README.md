# Teste de carga — certificados sob demanda

Harness para medir o fluxo introduzido na branch `task/certificado-remove-upload`:
o PDF do certificado deixou de ser gravado no Supabase e passa a ser renderizado
a cada `GET /certificate/:id/pdf`.

Sem dependências novas — usa `pg`, `bcrypt`, `jsonwebtoken` e o `fetch` nativo do
Node, todos já presentes no projeto.

## Antes de rodar

O `DATABASE_URL` do `.env` aponta para um Postgres **remoto** (Neon). Não existe
banco local nesse setup. Confirme em qual base você está antes de seedar:

```bash
node -e "require('dotenv/config'); console.log(new URL(process.env.DATABASE_URL).hostname)"
```

O seed só escreve dados marcados (`evento.codigo = 'LOADTEST'`, e-mails
`@loadtest.local`) e o cleanup só apaga por essas marcas — nenhum dado
pré-existente é tocado. Ainda assim, prefira uma branch do Neon dedicada.

## Uso

```bash
npm run build
npm run start:prod
```

```bash
node test/load/seed.cjs 500 20
```

Cria o evento `[LOADTEST] Congresso de Carga` finalizado, com 500 participantes
(+1 organizador), presença registrada em uma atividade e 20 convidados.

A presença importa: `findParticipacoesByEvent` só emite certificado para quem é
`participante` se houver `participacoes_atividades.presente = true`. Sem isso,
apenas organizadores e monitores recebem certificado.

```bash
node test/load/run.cjs --duracao=12 --niveis=1,5,10,25,50,100
```

| Flag | Padrão | O que faz |
|---|---|---|
| `--duracao` | `10` | segundos por nível da rampa |
| `--niveis` | `1,5,10,25,50` | concorrências testadas |
| `--leitura` | desligado | pula emissão e assinatura; só os GETs de PDF |
| `--pool` | todos | quantos certificados distintos circulam |
| `--distintos` | desligado | um ciclador único para a corrida toda, sem repetir ids entre níveis |

Sobre `--distintos`: sem ele a rampa reinicia o ciclo de ids a cada nível, e os
níveis mais altos batem em certificados que os anteriores já colocaram no cache
— o que infla a medição. Com ele, o script informa no fim quantas requisições
foram realmente distintas e avisa se o pool esgotou e recomeçou.

Fases: emissão em lote → assinatura em lote → custo unitário → rampa de
concorrência → PDF de convidado. Durante cada fase uma sonda bate em `GET /`
(rota sem I/O) a cada 200ms — é ela que revela bloqueio do event loop.

O relatório bruto vai para `test/load/results/*.json` (fora do git).

```bash
node test/load/cold-vs-warm.cjs 25 12
```

Compara os dois cenários que o cache de PDF trata de forma diferente, na mesma
concorrência: **frio** (cada requisição pega um certificado distinto — todo
mundo baixando o seu depois do e-mail de encerramento) e **quente** (pool
pequeno repetido — preview do iframe, botão de download, F5).

Só vale com o servidor recém-iniciado: o cache vive no processo, e um servidor
que já atendeu requisições não tem mais cenário frio.

```bash
node test/load/bench.cjs 25
```

Decompõe o custo unitário chamando o `dist/` direto, sem HTTP: round-trip ao
banco, query de render, QR e renderização do PDF isolados.

```bash
node test/load/cleanup.cjs
```

Remove evento, usuários, convidados e certificados marcados. As FKs são
`ON DELETE CASCADE`, então o evento leva tudo junto. As sequences de id não
retrocedem — inofensivo.

## Resultados

Ver [RELATORIO.md](RELATORIO.md).
