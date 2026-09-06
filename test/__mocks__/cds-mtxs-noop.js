// Mock do @sap/cds-mtxs para suites de teste que não precisam do MTX sidecar.
// Exporta um módulo vazio que não registra nenhum handler no CAP runtime.
// Referenciado via moduleNameMapper no jest.config.js para as suites
// sales-order-service e integration-service.
module.exports = {}
