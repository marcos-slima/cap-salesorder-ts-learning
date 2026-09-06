// Must run before @sap/cds is loaded.
// factory.js evaluates `process.env.CDS_TYPESCRIPT` at module-load time
// to decide whether to include '.ts' in the handler file extension list.
process.env.CDS_TYPESCRIPT = 'true'

// Desativa o plugin @sap/cds-mtxs em TODOS os testes automatizados.
//
// Por que é necessário:
//   O CAP carrega cds-plugin.js de TODOS os pacotes em node_modules
//   no boot do servidor.  O @sap/cds-mtxs/cds-plugin.js registra
//   handlers no `cds.xt.DeploymentService` que exigem um banco
//   por-tenant já provisionado — inexistente em testes in-memory.
//   Sem esta flag, o boot do `cds.test()` falha com:
//     "Cannot read properties of undefined (reading 'getExtCsvs')"
//
// Como funciona:
//   `CDS_PLUGINS` é lido por cds/lib/plugins.js ANTES de qualquer
//   import de @sap/cds.  O valor JSON sobrescreve o registro de
//   plugins — um plugin com `false` é ignorado no activate().
//   Referência: node_modules/@sap/cds/lib/plugins.js, linha 14.
//
// Testes de multitenancy (test/multitenancy.test.ts):
//   Não precisam do plugin pois validam apenas propagação de contexto
//   (cds.tx({ tenant })), configuração (cds.env) e padrões estruturais.
//   O teste E2E completo com sidecar é manual: npm run dev:mtx + dev:app.
// Nota: @sap/cds-mtxs é desativado via moduleNameMapper no jest.config.js
// para os workers Jest que rodam testes não-MTX, evitando que o plugin
// tente provisionar bancos por-tenant no boot do cds.test().
