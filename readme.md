# CAP Sales Order — TypeScript Reference

Reference implementation of a sales-order domain on the SAP Cloud Application
Programming Model (CAP), written in TypeScript. It covers transactional OData
services, analytical queries consumed by SAP Fiori Elements, multi-tenancy and
outbound/inbound integration (OData, REST, AMQP).

## Tech stack

| Area | Choice |
| --- | --- |
| Runtime | Node.js 24 (engines: `>=20`) |
| Framework | `@sap/cds` 10 (OData V4, draft-enabled entities) |
| Language | TypeScript — `tsgo` (TypeScript 7 native preview) for typechecking |
| Build tooling | TypeScript 6 (JS compiler API, used only by ts-jest/ts-node) |
| Tests | Jest 30 + ts-jest |
| Lint | ESLint 10 + `@sap/eslint-plugin-cds` |
| UI | SAP Fiori Elements (List Report, Object Page, Analytical List Page) |
| Persistence | SQLite (dev/test) and SAP HANA (production) |
| Integration | Northwind OData V4, REST, Solace/AMQP (`rhea`), AWS S3 attachments |

## Prerequisites

- Node.js `>=20` (CI uses 24.x)
- npm

## Getting started

```bash
npm ci
npm run dev          # cds watch on http://localhost:4004
```

Useful URLs:

- Service metadata: <http://localhost:4004/api/orders/$metadata>
- Analytical List Page: <http://localhost:4004/salesorder-analytics-alp/webapp/index.html>
- List Report: <http://localhost:4004/salesorder-listview/webapp/index.html>

The dev/test profiles use mocked authentication. Available users (any password):

| User | Roles |
| --- | --- |
| `alice` | `SalesProcessor`, `CatalogReader` |
| `bob` | `SalesManager`, `CatalogReader`, `AnalyticsReader` |
| `charlie` | `SalesAuditor`, `CatalogReader`, `AnalyticsReader` |
| `dave` | `AnalyticsReader` |

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start CAP with hot reload |
| `npm start` | Start the production-style server (`cds-serve`) |
| `npm run build` | Production build (`cds build --production`) into `gen/` |
| `npm run typecheck` | Typecheck with `tsgo --noEmit` (TypeScript 7) |
| `npm run lint` | Lint CDS artefacts with ESLint + `@sap/eslint-plugin-cds` |
| `npm test` | Run all Jest projects (96 tests) |
| `npm run test:coverage` | Jest with coverage report |
| `npm run ci` | Typecheck + lint + tests (used by CI) |
| `npm run typegen` | Regenerate `@cds-models` typings |

## Project layout

```text
app/                        Fiori Elements applications
  salesorder-analytics-alp/ ALP app (charts + analytical service)
  salesorder-listview/      List Report / Object Page app
db/                         Domain model, views and seed data
  domain/                   Sales order entities and types
  data/                     CSV seed data
srv/                        Service definitions and handlers
  services/                 CDS services + UI/analytics annotations
  handlers/                 Event handlers (header, item, integration, events)
  integration/              OData/REST clients and marshalling
  lib/                      Validation, status machine, messaging
  mtx/                      Multi-tenant sidecar
test/                       Jest suites (service, integration, multi-tenancy)
```

## Services

- `SalesOrderService` — draft-enabled transactional service for sales orders
  and items (create/update, submit, confirm delivery, recalculate pricing,
  logical delete).
- `SalesOperationalService` — read/write operational projection.
- `SalesCatalogService` — master data (business partners, products, etc.).
- `SalesAnalyticsService` — analytical queries and ALP aggregations.
- `IntegrationService` — inbound import from Northwind/REST, outbound
  marshalling.

Authorization uses `@requires`/`@restrict` with the roles listed above,
including instance-based restrictions (`SalesProcessor` only sees their own
orders).

## Testing and quality gate

```bash
npm run ci
```

The gate runs `tsgo` typecheck, ESLint and Jest. The Jest config defines two
projects: `main` (service/integration tests, with `@sap/cds-mtxs` mocked) and
`multitenancy` (loads the real MTX plugin without starting the server).

## TypeScript setup

Typechecking is done by [`tsgo`](https://github.com/microsoft/typescript-go)
(`@typescript/native-preview`, TypeScript 7). `typescript@6` remains an explicit
devDependency because ts-jest and ts-node still need the JavaScript compiler
API. No symlink or postinstall workaround is required.

## Deployment

`mta.yaml` describes the MTA (`cap-salesorder-ts-simple`) with HANA, XSUAA and
the MTX sidecar. Build with `npm run build` and deploy with the Cloud MTA Build
Tool / `cf deploy`.

---

## Git — Referência Rápida

### Solo
```bash
git status                          # ver estado
git add -A && git commit -m "..."   # salvar
git push                            # publicar
git pull --rebase                   # atualizar
```

### Equipe (feature branch)
```bash
git checkout main && git pull --rebase origin main
git checkout -b feature/nome-curto  # criar branch
# ... trabalhar e commitar ...
git push -u origin feature/nome-curto
# abrir Pull Request no GitHub
git checkout main && git pull --rebase origin main
git branch -d feature/nome-curto
```

### Correcções rápidas
```bash
git restore <ficheiro>              # descartar mudança local
git restore --staged <ficheiro>     # tirar do stage
git commit --amend -m "..."         # corrigir último commit
git stash push -m "wip"             # guardar temporariamente
git stash pop                       # restaurar
```

> Manual completo: [docs/GIT_MANUAL.md](docs/GIT_MANUAL.md)
