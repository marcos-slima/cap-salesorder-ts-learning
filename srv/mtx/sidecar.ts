/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/mtx/sidecar.ts
 *  LAYER : MTX Sidecar — Multi-Tenancy Extension Service
 *
 *  O que é o MTX Sidecar
 *  ──────────────────────
 *  O `@sap/cds-mtxs` (MTX = Multi-Tenancy eXtension) implementa o
 *  padrão "Sidecar" do CAP: um processo Node.js SEPARADO que gerencia
 *  o ciclo de vida dos tenants — sem interferir com o processo
 *  principal da aplicação (SalesOrderService).
 *
 *  Por que processo separado?
 *  ──────────────────────────
 *  O sidecar executa operações pesadas e raramente chamadas:
 *    • Criação de banco de dados por tenant (onboarding)
 *    • Migração de schema após novo deploy
 *    • Extensões de modelo por tenant (campos customizados)
 *  Separar estas operações do processo principal garante que um
 *  onboarding lento não degrada a performance da API transacional.
 *
 *  Serviços expostos pelo sidecar
 *  ────────────────────────────────
 *  O MTX sidecar expõe automaticamente três serviços técnicos:
 *
 *  1. SaasProvisioningService  →  /-/cds/saas-provisioning/
 *     Lifecycle hooks: PUT (onboard), DELETE (offboard), GET (upgrade)
 *     Em produção BTP: chamado pelo SAP SaaS Provisioning Service
 *     Em dev: chamado via curl ou REST client
 *
 *  2. ExtensibilityService  →  /-/cds/extensibility/
 *     Permite que cada tenant adicione campos/entidades ao modelo base
 *     sem afetar outros tenants.
 *
 *  3. DeploymentService  →  /-/cds/deployment/
 *     Migração de schema para tenants existentes após novo deploy.
 *
 *  Modelo de dados no desenvolvimento local
 *  ──────────────────────────────────────────
 *  Sem BTP, cada tenant recebe um arquivo SQLite separado:
 *    Tenant "acme"  →  ./db/mtx/acme.db
 *    Tenant "globo" →  ./db/mtx/globo.db
 *
 *  O isolamento é real: uma query em "acme" NÃO acessa dados de "globo".
 *
 *  Como rodar (dois terminais)
 *  ────────────────────────────
 *  Terminal 1 — Aplicação principal:
 *    npm run dev:app      →  cds watch --port 4004
 *
 *  Terminal 2 — MTX Sidecar:
 *    npm run dev:mtx      →  cds watch --port 4005 srv/mtx/sidecar.ts
 *
 *  Operações de tenant (após os dois processos estarem rodando):
 *
 *  Onboard tenant "acme":
 *    curl -X PUT http://localhost:4005/-/cds/saas-provisioning/tenant/acme \
 *         -H "Content-Type: application/json" \
 *         -d '{"subscribedSubdomain":"acme","subscribedTenantId":"acme"}'
 *
 *  Verificar tenants ativos:
 *    curl http://localhost:4005/-/cds/saas-provisioning/tenant
 *
 *  Criar pedido no tenant "acme":
 *    curl -X POST http://localhost:4004/api/orders/SalesOrders \
 *         -H "Content-Type: application/json" \
 *         -H "X-Tenant-Id: acme"        \
 *         -u alice:alice \
 *         -d '{"salesOrder":"ORD-001", ...}'
 *
 *  Offboard tenant "acme":
 *    curl -X DELETE http://localhost:4005/-/cds/saas-provisioning/tenant/acme
 *
 *  Upgrade de schema (após novo deploy da aplicação):
 *    curl -X POST http://localhost:4005/-/cds/deployment/upgrade \
 *         -H "Content-Type: application/json" \
 *         -d '{"tenants": ["acme", "globo"]}'
 *
 *  Auth no desenvolvimento local
 *  ──────────────────────────────
 *  O sidecar usa o mesmo `kind: mocked` do package.json — qualquer
 *  usuário configurado pode chamar os endpoints técnicos.
 *  Em produção BTP, o SaaS Provisioning Service usa um token técnico
 *  (client credentials) — não há usuário humano.
 *
 *  Referência
 *  ──────────
 *  https://cap.cloud.sap/docs/guides/multitenancy/mtxs
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'

// ── Ativação dos serviços MTX (somente neste processo) ────────────
//
// Os serviços cds.xt.* NÃO são declarados para [development] no
// .cdsrc.json — se fossem, o plugin seria ativado também no processo
// principal (dev:app), causando "TypeError: getExtCsvs" porque o
// ModelProviderService só existe no sidecar.
//
// Solução: configurar cds.env.requires ANTES de carregar o plugin
// (require em vez de import estático garante a ordem de execução).
// Em produção, os valores de .cdsrc.json [production] prevalecem
// sobre os defaults abaixo via ??= (não sobrescreve se já definido).
const requires = cds.env.requires as Record<string, unknown>
requires['cds.xt.SaasProvisioningService'] ??= { kind: 'saas-provisioning' }
requires['cds.xt.DeploymentService']       ??= true
requires['cds.xt.ExtensibilityService']    ??= true

// ── Plugin MTX ────────────────────────────────────────────────────
//
// Registra automaticamente os serviços técnicos neste processo:
//   /-/cds/saas-provisioning/   onboarding / offboarding de tenants
//   /-/cds/extensibility/       campos customizados por tenant
//   /-/cds/deployment/          upgrade de schema após novo deploy
//   /-/cds/jobs/                jobs assíncronos (progresso)
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('@sap/cds-mtxs')


// ── Servidor ───────────────────────────────────────────────────────
//
// `cds.serve('all')` inicia o servidor HTTP na porta definida pelo
// CLI (--port 4005 no script dev:mtx).
// Apenas os serviços técnicos do MTX são expostos — nenhum
// ApplicationService (SalesOrderService etc.) roda aqui.

cds.serve('all').catch((err: Error) => {
    cds.log('MTX').error('Failed to start MTX sidecar:', err)
    process.exit(1)
})
