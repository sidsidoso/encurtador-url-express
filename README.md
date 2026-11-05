# Encurtador de URLs — Express + SQLite

[![CI](https://github.com/sidsidoso/encurtador-url-express/actions/workflows/ci.yml/badge.svg)](https://github.com/sidsidoso/encurtador-url-express/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/node-%3E%3D20.12-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/express-5.x-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/sqlite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-yellow.svg)](LICENSE)

Encurtador de URLs desenvolvido como trabalho da disciplina de **Programação para Web**. Gera códigos curtos aleatórios em **base62**, aceita **códigos personalizados**, **redireciona com HTTP 302**, **conta acessos** (total e por dia) e oferece um endpoint de **estatísticas**. Apenas URLs `http`/`https` são aceitas.

## Sumário

- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Modelo de dados](#modelo-de-dados)
- [Endpoints](#endpoints)
- [Exemplos de uso](#exemplos-de-uso)
- [Decisões de implementação](#decisões-de-implementação)
- [Como executar](#como-executar)
- [Testes](#testes)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Referências](#referências)

## Tecnologias

| Tecnologia | Uso |
| --- | --- |
| [Node.js](https://nodejs.org/) ≥ 20.12 | Execução, `crypto.randomBytes`, `URL` (WHATWG) |
| [Express 5](https://expressjs.com/) | Rotas, redirecionamento e middlewares |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Persistência e transações síncronas |
| `node:test` + `fetch` nativo | Testes de integração |

## Arquitetura

```
                 POST /api/links {url, codigo?}
  Cliente ───────────────────────────────────────┐
     │                                           ▼
     │ GET /:codigo              ┌────────────────────────────────────┐
     ▼                           │ Express                            │
┌──────────────────────────┐     │  express.json({limit:'100kb'})     │
│ validarCodigo (regex)    │     │  validarCorpo ─► validarUrl        │
│   └─ inválido ─► 404     │     │       │           (http/https)     │
│ transação:               │     │       ▼                            │
│   UPDATE links ...       │     │  gerarCodigo() base62 ─► INSERT    │
│   RETURNING url          │     │       └─ UNIQUE violado? tenta de  │
│   UPSERT acessos_diarios │     │          novo (até 5x)             │
│ 302 Location: url        │     └───────────────┬────────────────────┘
└────────────┬─────────────┘                     │
             │      prepared statements          │
             ▼                                   ▼
        ┌──────────────────────────────────────────────┐
        │ SQLite (WAL): links · acessos_diarios         │
        └──────────────────────────────────────────────┘
   Erros ─► tratadorErros (JSON)   Rotas desconhecidas ─► 404 JSON
```

## Modelo de dados

**`links`**

| Coluna | Tipo | Restrições |
| --- | --- | --- |
| `id` | INTEGER | PK |
| `codigo` | TEXT | `UNIQUE` (índice usado no redirecionamento), sensível a maiúsculas |
| `url` | TEXT | até 2048 caracteres |
| `personalizado` | INTEGER | 0/1 |
| `acessos` | INTEGER | contador total |
| `criado_em` | TEXT | ISO 8601 UTC |
| `ultimo_acesso_em` | TEXT | ISO 8601 UTC ou `NULL` |

**`acessos_diarios`** (`WITHOUT ROWID`)

| Coluna | Tipo | Restrições |
| --- | --- | --- |
| `link_id` | INTEGER | FK → `links.id`, `ON DELETE CASCADE` |
| `dia` | TEXT | `AAAA-MM-DD` (UTC) |
| `total` | INTEGER | acessos no dia |

Chave primária composta `(link_id, dia)` — serve também de índice para a consulta de estatísticas.

## Endpoints

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| `GET` | `/saude` | — | Verificação de disponibilidade |
| `POST` | `/api/links` | — | Encurta uma URL (`url`, `codigo` opcional) → `201` |
| `GET` | `/api/links` | — | Lista links, mais recentes primeiro (`pagina`, `limite` ≤ 100) |
| `GET` | `/api/links/:codigo` | — | Detalhes de um link |
| `GET` | `/api/links/:codigo/estatisticas` | — | Total de acessos, último acesso e acessos por dia (30 dias) |
| `GET` | `/:codigo` | — | Redireciona (`302`) e contabiliza o acesso |

**Códigos de resposta:** `201` criado · `302` redirecionamento · `400` URL/código inválido ou JSON malformado · `404` código inexistente · `409` código personalizado em uso ou reservado (`api`, `saude`) · `413` corpo acima de 100kb.

## Exemplos de uso

> No Windows (PowerShell), use `curl.exe` e aspas duplas com as internas escapadas.

**Encurtar com código aleatório**

```bash
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"url":"https://developer.mozilla.org/pt-BR/docs/Web/HTTP/Status/302"}'
```

`201 Created`

```json
{
  "codigo": "ATbkBis",
  "url": "https://developer.mozilla.org/pt-BR/docs/Web/HTTP/Status/302",
  "personalizado": false,
  "acessos": 0,
  "criadoEm": "2026-11-05T19:39:01.126Z",
  "ultimoAcessoEm": null,
  "urlCurta": "http://localhost:3000/ATbkBis"
}
```

**Encurtar com código personalizado**

```bash
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.sqlite.org/wal.html","codigo":"sqlite-wal"}'
```

```json
{
  "codigo": "sqlite-wal",
  "url": "https://www.sqlite.org/wal.html",
  "personalizado": true,
  "acessos": 0,
  "criadoEm": "2026-11-05T19:39:01.142Z",
  "ultimoAcessoEm": null,
  "urlCurta": "http://localhost:3000/sqlite-wal"
}
```

Repetindo o código → `409 Conflict`: `{ "erro": "O código \"sqlite-wal\" já está em uso" }`

**URL não permitida**

```bash
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"url":"javascript:alert(1)"}'
```

`400 Bad Request`

```json
{
  "erro": "Dados inválidos",
  "detalhes": [
    { "campo": "url", "mensagem": "apenas URLs http ou https são permitidas" }
  ]
}
```

**Redirecionar**

```bash
curl -i http://localhost:3000/sqlite-wal
```

```
HTTP/1.1 302 Found
Cache-Control: private, no-store
Location: https://www.sqlite.org/wal.html

Found. Redirecting to https://www.sqlite.org/wal.html
```

**Estatísticas** (após 3 acessos)

```bash
curl http://localhost:3000/api/links/sqlite-wal/estatisticas
```

```json
{
  "codigo": "sqlite-wal",
  "url": "https://www.sqlite.org/wal.html",
  "acessos": 3,
  "criadoEm": "2026-11-05T19:39:01.142Z",
  "ultimoAcessoEm": "2026-11-05T19:39:01.164Z",
  "periodoDias": 30,
  "acessosPorDia": [
    { "dia": "2026-11-05", "acessos": 3 }
  ]
}
```

**Listagem paginada**

```bash
curl "http://localhost:3000/api/links?limite=1"
```

```json
{
  "dados": [
    {
      "codigo": "sqlite-wal",
      "url": "https://www.sqlite.org/wal.html",
      "personalizado": true,
      "acessos": 3,
      "criadoEm": "2026-11-05T19:39:01.142Z",
      "ultimoAcessoEm": "2026-11-05T19:39:01.164Z",
      "urlCurta": "http://localhost:3000/sqlite-wal"
    }
  ],
  "paginacao": { "pagina": 1, "limite": 1, "total": 2, "totalPaginas": 2 }
}
```

## Decisões de implementação

**Geração de códigos**

- 7 caracteres do alfabeto base62 (`0-9A-Za-z`) → 62⁷ ≈ 3,5 × 10¹² combinações.
- Bytes de `crypto.randomBytes` (fonte criptográfica, imprevisível) com **amostragem por rejeição**: bytes ≥ 248 são descartados, eliminando o viés que `byte % 62` teria.
- Códigos aleatórios evitam a enumeração de links que um contador sequencial permitiria.
- Colisões são detectadas pela restrição `UNIQUE` no próprio `INSERT` (sem `SELECT` prévio e sem condição de corrida), com até 5 novas tentativas.

**Redirecionamento e contagem**

- Um único `UPDATE ... WHERE codigo = ? RETURNING id, url` localiza o link pelo índice, incrementa o contador e devolve a URL.
- O contador diário usa *upsert* (`INSERT ... ON CONFLICT DO UPDATE`), gerando no máximo uma linha por link por dia, em vez de uma linha por acesso.
- Os dois incrementos ficam em uma `db.transaction` — ou ambos são gravados, ou nenhum.
- **302** (temporário) em vez de 301: navegadores fazem cache agressivo de 301, e os acessos seguintes não chegariam ao servidor. `Cache-Control: private, no-store` reforça isso.
- O código é validado por regex antes de qualquer acesso ao banco (`/favicon.ico`, por exemplo, nem chega ao SQLite).

**Segurança**

- Somente `http:` e `https:` (bloqueia `javascript:`, `data:`, `file:` etc., que poderiam executar código no navegador de quem clica).
- URLs com credenciais embutidas (`https://usuario:senha@host`) são recusadas — técnica comum de *phishing*.
- URLs normalizadas pela API `URL` (WHATWG) e limitadas a 2048 caracteres; corpo limitado a 100kb.
- Códigos personalizados restritos a `[A-Za-z0-9_-]{3,32}`, com palavras reservadas (`api`, `saude`) para não sombrear rotas da aplicação.
- Prepared statements criados uma vez; nenhum SQL concatenado; `x-powered-by` desabilitado; erros `500` sem detalhes internos.
- `BASE_URL` configurável: em produção as URLs curtas não dependem do cabeçalho `Host` enviado pelo cliente.
- Não há rota pública de exclusão: sem autenticação, qualquer pessoa poderia apagar links de terceiros.

## Como executar

**Pré-requisitos:** Node.js 20.12 ou superior e npm.

```bash
git clone https://github.com/sidsidoso/encurtador-url-express.git
cd encurtador-url-express
npm install
```

**Configuração (opcional)**

```bash
# Linux/macOS
cp .env.example .env
```

```powershell
# Windows (PowerShell)
Copy-Item .env.example .env
```

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP |
| `DB_PATH` | `encurtador.db` | Arquivo do banco SQLite |
| `BASE_URL` | protocolo + `Host` da requisição | Domínio público das URLs curtas |

**Executar**

```bash
npm start      # produção
npm run dev    # recarrega ao salvar (node --watch)
```

## Testes

```bash
npm test
```

Testes com `node:test` e `fetch` nativo (com `redirect: 'manual'` para inspecionar o `302`) contra a aplicação na porta `0` com banco `:memory:`. Cobrem: alfabeto e unicidade dos códigos, validação de URL (protocolos, credenciais, tamanho), códigos personalizados (formato, duplicidade, reservados), redirecionamento, contagem total e diária, estatísticas, paginação, `BASE_URL` e JSON malformado.

```
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

## Estrutura de pastas

```
encurtador-url-express/
├── .github/workflows/ci.yml       # CI: Node 20 e 22
├── src/
│   ├── app.js                     # cria o app (recebe db e config)
│   ├── server.js                  # inicia o servidor HTTP
│   ├── db.js                      # SQLite: pragmas e esquema
│   ├── rotas/
│   │   ├── links.js               # API /api/links
│   │   └── redirecionamento.js    # GET /:codigo → 302
│   ├── middlewares/
│   │   ├── codigo.js              # valida o formato do código
│   │   ├── erros.js               # ErroHttp, 404 e tratador central
│   │   └── validacao.js           # validação do corpo JSON
│   └── servicos/
│       ├── codigo.js              # gerador base62 sem viés
│       └── url.js                 # validação/normalização de URL
├── tests/
│   ├── auxiliar.js
│   └── encurtador.test.js
├── .env.example
├── package.json
└── LICENSE
```

## Referências

- RFC 9110 — [HTTP Semantics, seção 15.4.3 (302 Found)](https://datatracker.ietf.org/doc/html/rfc9110#name-302-found)
- WHATWG — [URL Standard](https://url.spec.whatwg.org/)
- OWASP — [Unvalidated Redirects and Forwards Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)
- SQLite — [UPSERT](https://www.sqlite.org/lang_upsert.html), [RETURNING](https://www.sqlite.org/lang_returning.html), [WITHOUT ROWID](https://www.sqlite.org/withoutrowid.html)
- Node.js — [`crypto.randomBytes`](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback)
- better-sqlite3 — [Documentação da API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).
