# Assinatura digital de certificados

Fluxo de **assinatura em lote** dos certificados de um evento. A assinatura é
**lógica + hash**: cada certificado é marcado como assinado no banco (quem
assinou, quando, com um código e um hash de integridade) e o PDF é **regerado**
com o bloco de assinatura **centralizado** no corpo do certificado (onde antes
ficavam as linhas). Não usa certificado criptográfico (.pfx/ICP‑Brasil).

O PDF **não é armazenado**. Ele é montado sob demanda em
`GET /api/v1/certificate/:id/pdf`, a partir das colunas do banco — assinar grava
apenas essas colunas, sem arquivo para regerar nem subir. Consequência prática:
ajuste no template vale para todos os certificados no próximo download, e o
documento nunca fica desatualizado em relação ao banco.

## O que foi implementado (back)

- **Schema** (`src/db/schema.ts`): novas colunas nas 3 tabelas de certificado
  (`certificado_evento`, `certificado_atividade`, `certificado_convidado`):
  `assinado`, `assinado_em`, `assinado_por`, `assinatura_nome`,
  `codigo_verificacao`, `hash_verificacao`.
- **`signature/verification-hash.ts`**: gera o código público
  (`XXXX-XXXX-XXXX`) e o hash SHA‑256 de integridade.
- **`signature/qr.ts`** (usa `qrcode`): gera o PNG do QR Code com a URL de
  verificação.
- **Templates** (`pdf/participant-certificate.pdf.ts`, `pdf/guest-certificate.pdf.ts`
  e `pdf/certificate.styles.ts`): as duas **linhas de assinatura** pré‑impressas
  foram removidas. No lugar, um bloco central reservado que, quando o certificado
  é assinado, mostra **centralizado**: o **QR Code**, a **logo do sistema**
  (Assinaê), o **nome completo de quem assina**, a **data** e o **código** de
  verificação. O bloco é preenchido re‑renderizando o PDF no ato da assinatura
  (nada de carimbo por cima), o que garante o alinhamento central.
- **`certificate-pdf.service.ts`** e **`controller/certificate-pdf.controller.ts`**:
  montam o PDF no momento do download, a partir das colunas. Só o titular do
  certificado ou um organizador do evento consegue baixar.
- **`signature/certificate-signature.service.ts`**: orquestra a assinatura em
  lote (só organizador). Grava as colunas de assinatura e faz a verificação
  pública.
- **`repository/certificate.respository.ts`**: buscas dos certificados (com os
  dados para re‑render), gravação/reset da assinatura e busca por código.
- **Controllers**: assinatura em lote (protegido) e verificação (público),
  registrados no `certificate.module.ts`.

## 1) Aplicar a migração do banco

As colunas novas precisam existir no banco. No terminal do projeto:

```bash
npm install            # instala pdf-lib e qrcode (já estão no package.json)
npm run db:push        # aplica o schema atual no banco
# ou, se preferir migração versionada:
# npm run db:generate && npm run db:migrate
```

SQL equivalente, caso queira aplicar à mão:

```sql
ALTER TABLE certificado_evento
  ADD COLUMN assinado boolean NOT NULL DEFAULT false,
  ADD COLUMN assinado_em timestamp,
  ADD COLUMN assinado_por integer REFERENCES usuario(id) ON DELETE SET NULL,
  ADD COLUMN assinatura_nome text,
  ADD COLUMN codigo_verificacao text,
  ADD COLUMN hash_verificacao text;
-- repita o mesmo bloco para certificado_atividade e certificado_convidado
```

## 2) Variáveis de ambiente (opcionais)

```env
# Segredo usado no hash de integridade (cai no JWT_SECRET se ausente)
SIGNATURE_SECRET=algum-segredo-forte
# Base do link de verificação codificado no QR Code do certificado.
# Default: {FRONTEND_URL}/certificate/verify  (rota do front)
# O código é anexado ao final: {FRONTEND_URL}/certificate/verify/AD1F-0DC8-9771
# Só defina CERTIFICATE_VERIFY_URL se quiser uma base diferente do FRONTEND_URL.
# CERTIFICATE_VERIFY_URL=https://app.seudominio.com/certificate/verify
```

## 3) Endpoints

### Assinar em lote (protegido — só organizador)

```
POST /api/v1/event/:eventoId/certificate/sign
Authorization: Bearer <token>
```

Assina **todos** os certificados ainda não assinados do evento (participantes e
convidados). Idempotente: rodar de novo só assina os que faltam.

`?force=true` reassina também os já assinados, gerando **código e hash novos**.
Mudança de layout não exige mais isso: o PDF é montado no download, então
qualquer ajuste no template já vale para todo mundo. Use com cuidado — rotacionar
o código **invalida os QR Codes já distribuídos**.

```
POST /api/v1/event/:eventoId/certificate/sign?force=true
```

Resposta:

```json
{
  "data": {
    "message": "12 certificado(s) assinado(s) em lote.",
    "data": {
      "assinados": 12,

      "assinante": "Maria Organizadora",
      "certificados": [
        { "tipo": "evento", "certificadoId": 45, "titular": "João Silva", "codigoVerificacao": "A1B2-C3D4-E5F6" }
      ]
    }
  },
  "statusCode": 201
}
```

Erros: `403` (não é organizador), `404` (nada pendente), `401` (sem token).

### Verificar um certificado (público)

```
GET /api/v1/certificate/verify/:codigo
```

`:codigo` é o código estampado no PDF (com ou sem hífens). Retorna
`{ valido: true|false, ... }` com titular, evento/atividade, datas e hash.

## 4) Como chamar no front (botão "Assinar em lote")

O botão fica na tela de certificados de um evento, então ele já tem o `eventoId`.

```ts
async function assinarEmLote(eventoId: number) {
  const res = await fetch(
    `${API_URL}/event/${eventoId}/certificate/sign`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    const erro = await res.json();
    throw new Error(erro?.message ?? "Falha ao assinar certificados");
  }

  const { data } = await res.json();
  return data.data; // { assinados, assinante, certificados: [...] }
}
```

Exemplo com o botão (React):

```tsx
const [carregando, setCarregando] = useState(false);

async function onAssinarEmLote() {
  try {
    setCarregando(true);
    const r = await assinarEmLote(eventoId);
    toast.success(`${r.assinados} certificado(s) assinado(s)!`);
    await recarregarCertificados(); // reflete o "assinado" na lista
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    setCarregando(false);
  }
}

<button onClick={onAssinarEmLote} disabled={carregando}>
  {carregando ? "Assinando..." : "Assinar em lote"}
</button>
```

Verificação pública (tela/QR de validação):

```ts
async function verificarCertificado(codigo: string) {
  const res = await fetch(`${API_URL}/certificate/verify/${codigo}`);
  const { data } = await res.json();
  return data; // { valido, message, data? }
}
```

### Observações

- Assinar grava só colunas. O bloco de assinatura aparece na próxima vez que o
  PDF for baixado — não há URL para o front reler.
- Emita os certificados antes de assinar: a assinatura age sobre as linhas que já
  existem.
- A coluna `arquivo_pdf` continua no schema com as URLs antigas, mas nada mais a
  lê nem a escreve. Ela e os arquivos no bucket são lixo a ser removido.
- O front pode esconder/desabilitar o botão quando não houver pendências.

### Mudança de layout

Não exige mais reassinatura. Como o PDF é montado no download, qualquer ajuste
nos templates de `pdf/` passa a valer para **todos** os certificados — inclusive
os emitidos antes da mudança — na próxima vez que forem baixados.
