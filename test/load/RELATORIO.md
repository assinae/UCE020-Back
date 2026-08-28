# Teste de carga — geração de certificados sob demanda

Branch `task/certificado-remove-upload` · 26/08/2026

## Ambiente

| | |
|---|---|
| Servidor | local, `npm run start:prod` (build, não watch), Node 22.21.1, Windows 11 |
| Banco | Neon em `us-east-1` — o mesmo do `DATABASE_URL` do `.env` local, remoto |
| Massa | evento sintético finalizado, 501 participantes + 20 convidados, 521 certificados assinados |
| Gerador de carga | mesma máquina do servidor |

**Ressalva importante:** o banco está do outro lado do continente — cada
round-trip custa ~118ms daqui. Na Railway, API e banco ficam próximos e isso cai
para a casa de 10ms. Os números absolutos abaixo **não são os números de
produção**. O que transfere é o *formato* das curvas: onde satura, como a
latência cresce e o que degrada junto.

## Metodologia da comparação antes/depois

Duas armadilhas apareceram no caminho e valem registro, porque invalidaram
medições que pareciam boas:

**1. Variação térmica.** As primeiras medições, tiradas depois de vários
minutos de carga contínua, davam ~3,3 req/s. As mesmas rampas com o servidor
recém-iniciado dão ~5,5 req/s. Mesma máquina, mesmo código — é o processador
desacelerando. Por isso toda comparação abaixo é **back-to-back**: código
antigo restaurado com `git stash`, rebuild, servidor reiniciado antes de cada
corrida, mesmo script, mesma sessão.

**2. Contaminação do cache entre níveis.** A rampa reiniciava o ciclo de ids a
cada nível de concorrência, então o nível 25 batia em certificados que o nível
10 já tinha colocado em cache — e o resultado parecia 5× melhor do que era. A
flag `--distintos` usa um ciclador único para a corrida inteira e o script
declara no fim quantas requisições foram realmente distintas. As medições de
cenário frio abaixo estão confirmadas como **100% cache miss** (307 e 312
requisições, nenhuma repetida).

## Custo de um download

`bench.cjs`, 25 iterações, chamando o `dist/` sem passar pelo HTTP:

| Componente | p50 | Natureza |
|---|---|---|
| Round-trip ao Neon (`select 1`) | 118ms | rede |
| Query de render (3 joins) | 118ms | rede — o join é gratuito |
| `gerarQrPng` | 25ms | CPU |
| **Render do PDF** | **~400ms** | **CPU na thread principal** |

Ponta a ponta pelo HTTP: **p50 ~500ms**, PDF de **118 KB**.

## Cenário frio — cada pessoa baixa o seu, pela primeira vez

O pior caso e o mais previsível: evento encerra, e-mail dispara, 500 pessoas
clicam em "baixar certificado". Nenhuma delas tem cache. 10s por nível.

| VUs | req/s antes | req/s depois | p50 antes | p50 depois | sonda `GET /` p99 antes | depois |
|---|---|---|---|---|---|---|
| 1 | 2,0 | 2,2 | 496ms | 446ms | 98ms | 56ms |
| 5 | 4,5 | 4,6 | 1.101ms | 1.045ms | 336ms | 235ms |
| 10 | 5,2 | 5,2 | 1.904ms | 1.927ms | 561ms | 541ms |
| 25 | 5,7 | 5,7 | 4.652ms | 4.454ms | 747ms | 678ms |
| 50 | 5,5 | 6,2 | 8.401ms | 8.042ms | 716ms | 645ms |

**Idêntico, e tinha que ser.** Cache não ajuda quem nunca pediu aquele
documento antes, e `ETag` não ajuda um navegador que nunca viu o arquivo. As
diferenças na tabela são ruído de medição.

Três leituras que continuam valendo:

**O sistema não cai — ele enfileira.** Zero erros em todos os níveis. A
latência segue a Lei de Little: `p50 ≈ VUs ÷ 5,7 req/s`. 50 VUs → 8,8s
previsto, 8,0s medido. Localmente isso vira só espera; atrás do gateway da
Railway vira 502/504.

**A API inteira degrada junto.** A sonda bate em `GET /`, que devolve a string
`"API"` — zero I/O, zero banco. Ela sai de 56ms para 645ms. É o event loop
travado pelo render: durante um pico de downloads, login, listagem e registro
de presença sofrem o mesmo atraso.

**Aumentar o threadpool não resolve.** Rampa inteira com
`UV_THREADPOOL_SIZE=16`: platô estatisticamente igual ao padrão. O trabalho é
CPU na thread principal, não I/O no threadpool.

## Cenário quente — download repetido

Pool de 15 certificados em circulação. Representa o que acontece numa sessão
real: a tela de detalhe baixa o PDF para o preview no iframe, o botão de
download baixa de novo, o usuário aperta F5.

| VUs | req/s antes | req/s depois | p50 antes | p50 depois | sonda `GET /` p99 antes | depois |
|---|---|---|---|---|---|---|
| 1 | 2,0 | **4,0** | 488ms | **239ms** | 91ms | **22ms** |
| 5 | 4,5 | **17,9** | 1.051ms | **245ms** | 248ms | **11ms** |
| 10 | 5,5 | **39,8** | 1.722ms | **239ms** | 400ms | **9ms** |
| 25 | 6,4 | **40,5** | 3.916ms | **586ms** | 475ms | **17ms** |
| 50 | 6,2 | **42,2** | 7.780ms | **1.165ms** | 569ms | **36ms** |

Vazão **6,8× maior** a 50 VUs, p50 de 7,8s para 1,2s.

E o resultado mais interessante não é a vazão: **a sonda colateral não sobe.**
Fica entre 9ms e 36ms em toda a rampa, contra 645ms no cenário frio e 569ms no
código antigo. Um acerto de cache é I/O puro — não bloqueia o event loop. O
cache não acelera só a rota de PDF: impede que o pico de downloads derrube a
responsividade do resto da API.

A memória acompanha: pico de 244 MB no cenário quente contra 401 MB no frio,
porque não há buffers intermediários de renderização.

## Memória

| | Frio | Quente |
|---|---|---|
| Baseline | 130 MB | 148 MB |
| Pico sob carga | 401 MB | 244 MB |
| Após a carga | 305 MB | 178 MB |

Não vaza — volta a um patamar estável.

As medições acima foram feitas com o teto do cache em 64 MB. Ele passou a ser
ajustável por `CERTIFICATE_PDF_CACHE_MB`, com **default de 16 MB** (~135 PDFs de
118 KB): com isso o pior caso fica em ~420 MB, que cabe num container de 512 MB.
O ganho do cenário quente praticamente não muda, porque o conjunto de
certificados ativos num evento real é bem menor que 135. `0` desliga o cache.

## Assinatura em lote

`POST /event/:id/certificate/sign?force=true` com 521 certificados, medido
back-to-back:

| | Antes | Depois |
|---|---|---|
| Duração | **64.971ms** | **845ms** |
| Por certificado | 124,7ms | 1,6ms |
| Sonda `GET /` durante | p50 5ms | p50 5ms |

124,7ms por certificado era exatamente o round-trip ao Neon: a assinatura era
**100% dominada por idas ao banco**, com um `for` sequencial fazendo um
`UPDATE ... WHERE id = $1` por certificado. Agora é um comando só.

Por ser I/O, ela nunca travou o event loop — a sonda ficou em 5ms nos dois
casos. O problema era o relógio: uma requisição HTTP de mais de um minuto, que
estouraria o timeout de qualquer gateway num evento grande.

## Emissão em lote

Rápida e sem problema — 2,1s para resolver 501 participantes, porque usa insert
em lote. Vale notar que custa os mesmos 2,1s **mesmo emitindo zero**
certificados: `findParticipacoesByEvent` e `findExistingUserCertificatesByEvent`
carregam as duas listas inteiras antes de comparar.

## O que foi verificado além do tempo

- PDF íntegro (assinatura `%PDF`, 120.949 bytes) e byte-a-byte idêntico entre a
  renderização e o acerto de cache;
- reassinar troca o `ETag` e o conteúdo, e um `If-None-Match` com o valor antigo
  devolve 200 com o PDF novo — não existe caminho que sirva documento vencido;
- `304` sai sem corpo e com os cabeçalhos de CORS (`allow-origin`,
  `allow-credentials`), então a revalidação do front funciona cross-origin;
- preflight `OPTIONS` continua respondendo 204 com `allow-headers: authorization`;
- verificação pública pelo código continua respondendo;
- template de convidado continua renderizando;
- participante alheio pedindo certificado de outro continua recebendo 403.

## Recomendações

> Os itens 1, 4 e 5 foram implementados. Os itens 2 e 3 seguem em aberto — e
> são exatamente os que atacam o cenário frio, que não melhorou.

**1. Cachear o PDF renderizado.** — *implementado.* Cache LRU em memória
(`pdf-cache.ts`), chaveado pelo hash do conteúdo impresso. Como a chave deriva
do que aparece no papel, reassinatura ou renome do evento produzem chave nova e
a entrada velha só envelhece — não existe invalidação explícita para errar.

Isso preserva a decisão da branch: continua gerando sob demanda, só não joga o
resultado fora. Se um dia precisarem de persistência entre restarts ou entre
instâncias, o passo seguinte é gravar no bucket na primeira renderização —
upload preguiçoso, não ansioso.

**2. Limitar a concorrência da rota.** — *em aberto.* A 50 VUs no cenário frio
o p50 vai a 8s e ninguém recebe erro: todo mundo espera. Atrás do gateway isso
vira 504 depois de ter queimado a CPU à toa. Um semáforo de 4 slots devolvendo
429 acima disso falha rápido e explicitamente, e o front consegue mostrar
"tente em instantes" em vez de pendurar a tela.

Exige mexer no front junto — é a primeira da lista que custa PR nos dois repos.

**3. Tirar o render do event loop.** — *em aberto.* Um pool de worker threads
não aumenta a vazão total (a CPU é a mesma), mas devolve responsividade para
login, listagem e presença durante um pico frio. No cenário quente o cache já
resolveu isso (sonda em 9–36ms), então o worker só se justifica pelo pior caso.

**4. Trocar o loop de UPDATE da assinatura por um comando só.** —
*implementado.* Um `json_to_recordset` transformou 521 round-trips em 1.

Detalhe de implementação: a primeira tentativa usou `unnest($1::int[], ...)` e
quebrou com `cannot cast type record to integer[]` — o template `sql` do
Drizzle achata array JS em lista de parâmetros, que vira um `record`. Passar o
lote como um único parâmetro JSON resolve e, de quebra, nunca esbarra no teto
de 65.535 parâmetros do protocolo.

**5. `Cache-Control` / `ETag` no PDF assinado.** — *implementado.* O servidor
descobre o `ETag` com uma consulta, sem renderizar nada: uma revalidação custa
5ms de query em vez de 400ms de CPU. `private, no-cache` manda revalidar
sempre — um `max-age` serviria PDF vencido depois de uma reassinatura.

## Números para dimensionar

| Cenário | Veredito |
|---|---|
| Até ~10 downloads simultâneos, primeira vez | p50 ~2s — aceitável |
| 25 simultâneos, primeira vez | p50 ~4,5s — ruim, mas responde |
| 50+ simultâneos, primeira vez | p50 8s+ — risco de timeout no gateway |
| Qualquer volume, download repetido | p50 abaixo de 1,2s, API saudável |

O cenário que preocupa continua sendo o previsível: encerramento de evento
grande, e-mail para todos, todo mundo clicando na mesma meia hora. 500 pessoas
com teto de ~5,7 req/s levam **~1,5 minuto** para escoar se chegarem juntas — e
a API fica lenta para todo mundo nesse intervalo. É o que os itens 2 e 3
resolvem.
