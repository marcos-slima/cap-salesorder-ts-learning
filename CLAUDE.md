# CLAUDE.md — cap-salesorder-ts-learning

## Project Overview

SAP CAP (Cloud Application Programming Model) full-stack application for Sales Order management, built with TypeScript. A learning project demonstrating enterprise-grade patterns: multi-tenancy, event-driven architecture, Fiori Elements UI, and integration with external services.

**Current Status**: 96 tests passing | Multi-tenancy implemented | Fiori Elements advanced features complete

## Architecture & Structure

```
├── app/                          # UI applications
│   ├── salesorder-listview/     # Fiori Elements ListReport + ObjectPage
│   └── salesorder-analytics-alp/ # Analytics (Analytical List Page)
├── db/                          # Data models & seed data
│   ├── domain/
│   │   └── sales-orders.cds     # Core domain model
│   ├── data/                    # CSV seed files for local dev
│   └── init.js                  # Initialization scripts
├── srv/                         # Backend services
│   ├── handlers/                # Business logic handlers
│   │   ├── sales-order-service.ts
│   │   ├── order-header-handler.ts
│   │   ├── order-item-handler.ts
│   │   └── event-consumer-handler.ts
│   ├── integration/             # External service integrations
│   │   ├── import-orchestrator.ts
│   │   ├── http-client.ts
│   │   ├── marshallers.ts
│   │   └── types.ts
│   ├── index.cds                # Service definitions
│   ├── services/
│   │   └── sales-order-service.cds
│   └── server.ts                # Express server config
├── test/
│   └── integration-service.test.ts
└── package.json                 # Dependencies & scripts
```

## Key Implementation Details

### 1. Fiori Bootstrap Requirement
**Important**: The Fiori UI requires a specific DOM structure to render correctly.

**Issue**: Empty `<body>` in index.html causes silent white screen with no console errors.

**Solution**: [app/salesorder-listview/webapp/index.html](app/salesorder-listview/webapp/index.html) must contain:
```html
<body>
  <div data-sap-ui-component data-name="sap.ui.core.ComponentSupport"></div>
</body>
```

This div is mandatory — without it, `ComponentSupport` cannot attach the Fiori component, and the app silently fails.

### 2. Analytical List Page (ALP) Limitation
**Issue**: Fiori `AnalyticalListPage` is not available in the public CDN — it's a BTP-exclusive feature.

**Solution**: Use `ListReport` with advanced features instead for public/learning environments.

Reference: [app/salesorder-analytics-alp/](app/salesorder-analytics-alp/)

### 3. Multi-Tenancy
Implemented at database and service layers. All queries automatically scoped to tenant context via CAP framework.

### 4. Integration Layer
- **HTTP Client** ([srv/integration/http-client.ts](srv/integration/http-client.ts)): Handles external API calls to Northwind, REST services
- **Marshallers** ([srv/integration/marshallers.ts](srv/integration/marshallers.ts)): Data transformation between external formats and CAP models
- **Import Orchestrator** ([srv/integration/import-orchestrator.ts](srv/integration/import-orchestrator.ts)): Choreography for multi-step imports with retry logic

## Testing
- **Command**: `npm test`
- **Status**: 96 tests passing
- **Type**: Integration tests with real local database (not mocks)
- **File**: [test/integration-service.test.ts](test/integration-service.test.ts)

## Development Workflow

```bash
# Start local CAP server with auto-reload
npm start

# Run tests
npm test

# Build for production
npm run build
```

The server starts on `http://localhost:4004` by default.

## Next Steps — Roadmap

✅ **Completed**:
- Multi-tenancy local implementation
- Fiori Elements with ListReport + ObjectPage
- Advanced Fiori features
- 96 tests passing
- Event-driven architecture

⏳ **Pending** (in order):
1. **Deploy to BTP Cloud Foundry** — Move from local to enterprise environment
2. **SAP HANA Database** — Migrate from SQLite to HANA
3. **Real Event Mesh** — Replace local event simulation with SAP Event Mesh
4. **S/4HANA Integration** — Connect to actual ERP backend
5. **AI/Joule Integration** — Add intelligent features
6. **Certification** — CAP Developer Associate or similar

## User Profile & Preferences

- **Level**: SAP CAP pleno developer
- **Current Access**: No BTP/S/4HANA environment yet (learning locally)
- **Goal**: Build enterprise-ready skills for full SAP stack deployment
- **Email**: s.marcos.lima@gmail.com

## Important Notes

- **Do not use empty bodies in HTML** — Always include the required Fiori div.
- **Test with real database** — Do not mock the database in tests; use local SQLite for integration tests.
- **Check Fiori CDN limitations** — Some advanced features (ALP, specialized analytics) only work on BTP, not public CDN.
- **CSV data for local seeding** — Use data files in `db/data/` for development; they're version-controlled for consistency.

---

**Last Updated**: 2026-05-04
