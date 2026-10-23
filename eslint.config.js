'use strict'

// Flat config for ESLint 9/10.
//
// The plugin only lints CDS artefacts (*.cds, *.csn, *.csv).
//
// `npm run lint` invokes ESLint directly: cds-dk 10.2.0 does not apply rule
// overrides from this file (Linter.js reads the async config without awaiting
// it before reconciling severities), so a `cds lint` run would ignore the
// file-scoped override below.

const cds = require('@sap/eslint-plugin-cds')

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'gen/**',
      'dist/**',
      '@cds-models/**',
      'app/**/webapp/**',
      'app/**/dist/**',
      'mta_archives/**',
      'legacy-seed/**'
    ]
  },
  cds.configs.recommended,
  {
    // The bound actions of SalesOrderService/SalesOperationalService need an
    // action-level @restrict: it takes precedence over the entity-level
    // instance restriction (where: '$user = createdBy').  Rewriting them as
    // @requires would let the entity restriction apply and deny otherwise
    // valid calls with 403 (covered by the integration test suite).
    files: ['srv/services/sales-order-service.cds'],
    rules: {
      '@sap/cds/auth-use-requires': 'off'
    }
  }
]
