# SAP CAP End-to-End Technical Walkthrough

Project: cap-salesorder-ts-learning

This guide is a step-by-step architecture and debugging manual for this CAP solution, from CDS model to Fiori UI and integrations.

---

## 1. Project Architecture Overview

### 1.1 Big Picture
This project is a layered CAP application with four main service surfaces:

- Transactional Orders API at /api/orders and /api/ops
- Catalog API at /api/catalog
- Analytics API at /api/analytics
- Integration API at /api/integration

Core architecture files:

- db/index.cds
- srv/index.cds
- srv/services/sales-order-service.cds
- srv/services/integration-service.cds

### 1.2 Folder Roles

- db: persistence model (types, aspects, domain entities, master data, integration shadow entities)
- srv: service definitions and runtime logic (handlers, validators, eventing, integration clients)
- app: Fiori Elements apps and app-local annotation entry points
- test: unit/integration tests with mocked auth and in-memory DB setup
- docs: architecture and deep technical documentation
- @cds-models: generated TypeScript typings from CDS

### 1.3 Layer Interaction

ASCII architecture flow:

    Fiori FE / External Clients
             |
             v
      CAP OData Runtime
             |
             v
      Service Projections
             |
             v
      Handler Orchestration
      + Validator + Status Machine
      + Event Publisher
             |
             v
      DB (SQLite/HANA) + Messaging

---

## 2. Data Model Layer (CDS)

### 2.1 Domain Model
Main domain model is in db/domain/sales-orders.cds.
Aggregate root is SalesOrders; children include items, partners, conditions, schedule lines, texts.

### 2.2 Entities, Associations, Compositions

- Composition is used for owned lifecycle:
  - SalesOrders -> SalesOrderItems
  - SalesOrderItems -> SalesOrderScheduleLines / SalesOrderItemConditions
- Association is used for external master data:
  - Products
  - BusinessPartners
  - SalesAreas
  - Code lists

Supporting files:

- db/masterdata/master-data.cds
- db/types/common-types.cds
- db/aspects/domain-aspects.cds

### 2.3 Annotations and Semantics

- Reusable aspects:
  - SoftDeletable
  - StatusTracked
  - EventEmitting
  - Monetized
- UI and analytical vocabularies are split by concern:
  - srv/services/annotations.ui.cds
  - srv/services/annotations.analytics.cds

### 2.4 Persistence Generation
CAP compiles CDS into persistence artifacts and service metadata.

- Source model entrypoint: db/index.cds
- Build target output: gen
- Build script in package.json runs cds build --production

---

## 3. Service Layer

### 3.1 CDS Services
Main service contract file: srv/services/sales-order-service.cds

It defines:

- SalesOrderService (transactional)
- SalesOperationalService (transactional app-facing)
- SalesCatalogService (read-only master data)
- SalesAnalyticsService (analytical queries)

Integration service contract:
- srv/services/integration-service.cds

### 3.2 OData Exposure

- /api/orders
- /api/ops
- /api/catalog
- /api/analytics
- /api/integration

Service bootstrap entry:
- srv/index.cds
- srv/server.ts

### 3.3 Event Handlers and Business Logic

Runtime orchestrator:

- srv/handlers/sales-order-service.ts

Business logic split by responsibility:

- Header lifecycle/actions: srv/handlers/order-header-handler.ts
- Item invariants/actions: srv/handlers/order-item-handler.ts
- Integration actions/functions: srv/handlers/integration-service.ts
- Inbound messaging consumer: srv/handlers/event-consumer-handler.ts

Domain services used by handlers:

- Validation rules: srv/lib/validations.ts
- Status transitions: srv/lib/status-machine.ts
- Event publication: srv/lib/events.ts

---

## 4. Runtime Flow

### 4.1 Request Lifecycle in CAP

Step-by-step:

1. Request reaches OData endpoint (for example /api/ops/SalesOrders).
2. CAP resolves service and projection.
3. Auth checks run (service-level @requires and entity/action @restrict).
4. Handler hooks run in sequence:
   - before
   - on
   - after
5. CQL executes against DB.
6. Response is serialized as OData V4 JSON.

### 4.2 UI -> Service -> DB

    Fiori ALP/ListReport
      -> OData V4 query
      -> CAP service projection
      -> handler logic (if needed)
      -> SQL via CQL
      -> DB rows
      -> OData response
      -> FE rendering

---

## 5. Fiori Elements / UI Layer

### 5.1 UI Structure

Apps:

- Transactional list/object app:
  - app/salesorder-listview/webapp/manifest.json
- Analytical List Page:
  - app/salesorder-analytics-alp/webapp/manifest.json

App annotation entry:

- app/services.cds
- app/salesorder-listview/annotations.cds
- app/salesorder-analytics-alp/annotations.cds

### 5.2 How Annotations Drive UI

Central annotation model:

- srv/services/annotations.ui.cds
- srv/services/annotations.analytics.cds

It controls:

- LineItem columns
- SelectionFields
- FieldGroups/Object Page facets
- Action buttons
- ALP chart + selection presentation variants

### 5.3 Navigation Patterns

From app/salesorder-listview/webapp/manifest.json:

- List Report SalesOrders -> Object Page SalesOrders
- SalesOrders Object Page -> nested Object Page SalesOrderItems

From app/salesorder-analytics-alp/webapp/manifest.json:

- AnalyticalListPage OpenOrdersQuery -> Object Page OpenOrdersQuery

---

## 6. Integration Layer

### 6.1 External Services

- Northwind OData client:
  - srv/integration/northwind-client.ts
- DummyJSON REST client:
  - srv/integration/rest-client.ts

### 6.2 Orchestration and Mapping

- Import orchestration:
  - srv/integration/import-orchestrator.ts
- Marshalling/unmarshalling:
  - srv/integration/marshallers.ts
- Integration handler:
  - srv/handlers/integration-service.ts

### 6.3 Messaging/Eventing

Outbound domain events:

- srv/lib/events.ts

Inbound event consumers:

- srv/handlers/event-consumer-handler.ts

Config source:

- package.json under cds.requires.messaging
- local: file-based messaging
- production: enterprise-messaging with persistent outbox

---

## 7. Debugging Guide

### 7.1 Best Breakpoint Locations

Set breakpoints in this order:

1. srv/server.ts for startup and global READ logging
2. srv/handlers/sales-order-service.ts init orchestration
3. srv/handlers/order-header-handler.ts for submitOrder, confirmDelivery, logicalDelete
4. srv/handlers/order-item-handler.ts for addToDelivery and netAmount sync
5. srv/lib/validations.ts for invariant failures
6. srv/lib/status-machine.ts for transition logic
7. srv/services/annotations.ui.cds and srv/services/annotations.analytics.cds for FE metadata behavior (ALP chart/filter issues)

### 7.2 Common Issues and Fast Diagnosis

- Filter length mismatch versus grid data
  - Check type in db/types/common-types.cds
  - Check seed values in db/data/com.my.sales-SalesOrganizations.csv

- ALP chart invalid data / mixed units
  - Check Measures.ISOCurrency in srv/services/annotations.analytics.cds
  - Check chart/variant terms in srv/services/annotations.ui.cds

- Action not working
  - Validate @restrict in srv/services/sales-order-service.cds
  - Confirm handler registration in srv/handlers/sales-order-service.ts

- Event not emitted/consumed
  - Validate messaging config in package.json
  - Trace publish in srv/lib/events.ts
  - Trace consume in srv/handlers/event-consumer-handler.ts

---

## 8. Execution Lifecycle

### 8.1 cds watch
What happens:

1. Loads CDS model from db + srv + app annotation files.
2. Starts service runtime and binds handlers.
3. Connects DB based on environment config.
4. Applies mocked auth users in development.
5. Enables hot reload behavior.

Entry references:

- package.json scripts.dev
- srv/index.cds
- srv/server.ts

### 8.2 cds build
What happens:

1. Compiles CDS for production profile.
2. Generates deployable artifacts under gen.
3. TypeScript check runs with tsc --noEmit according to build script.

Reference:

- package.json scripts.build

### 8.3 cds deploy
What happens conceptually:

1. Applies generated model to target DB.
2. In dev/test often SQLite; in production HANA.
3. Creates/updates tables and views from CDS model.

Related config:

- package.json cds.requires.db
- mta.yaml for Cloud Foundry deployment path using gen/srv and gen/db

---

## 9. Key Files Explained

- package.json
  Central runtime/build/test scripts and all CAP requires configuration.

- db/index.cds
  Database model aggregator.

- srv/index.cds
  Service model aggregator.

- srv/services/sales-order-service.cds
  OData contract, projections, roles, actions, analytical query definitions.

- srv/services/annotations.ui.cds
  FE UI metadata and navigation/chart presentation terms.

- srv/services/annotations.analytics.cds
  Analytical semantics (@Analytics, @Aggregation, @Measures).

- srv/handlers/order-header-handler.ts
  Root aggregate behavior and domain action implementation.

- srv/handlers/order-item-handler.ts
  Item-level invariants and delivery event trigger action.

- app/salesorder-listview/webapp/manifest.json
  Transactional FE app routes and page templates.

- app/salesorder-analytics-alp/webapp/manifest.json
  ALP startup, entity set binding, navigation and variant path.

- xs-security.json
  Scopes, role templates, role collections for XSUAA.

- mta.yaml
  BTP module/resource topology and deployment descriptors.

---

## 10. End-to-End Execution Example

### Scenario: User opens ALP and filters Open Orders

1. Browser loads ALP app manifest from app/salesorder-analytics-alp/webapp/manifest.json.
2. App connects to /api/analytics and requests metadata.
3. CAP serves SalesAnalyticsService projection from srv/services/sales-order-service.cds.
4. FE applies UI annotations from srv/services/annotations.ui.cds and analytical semantics from srv/services/annotations.analytics.cds.
5. User filters by salesOrgCode and status in ALP filter bar.
6. FE issues OData query with apply/groupby/aggregate.
7. CAP executes query against OpenOrdersView defined in db/domain/sales-orders.cds.
8. DB returns grouped rows and currency-safe netAmount semantics.
9. CAP serializes response as OData V4 JSON.
10. FE renders chart + table and supports drill-in navigation to object page.

ASCII flow:

    ALP UI
      -> GET /api/analytics/$metadata
      -> GET /api/analytics/OpenOrdersQuery?$apply=...
      -> CAP SalesAnalyticsService
      -> OpenOrdersView SQL
      -> DB rows
      -> OData JSON
      -> Chart/Table render

---

## Practical Learning Path (Recommended)

1. Start with db/types/common-types.cds and db/domain/sales-orders.cds.
2. Move to service projections in srv/services/sales-order-service.cds.
3. Trace one action end-to-end in srv/handlers/order-header-handler.ts.
4. Validate UI semantics in srv/services/annotations.ui.cds and analytics semantics in srv/services/annotations.analytics.cds.
5. Inspect ALP/ListReport manifests to understand FE routing.
6. Explore integration flow via srv/integration/import-orchestrator.ts.
7. Review security/deployment in xs-security.json and mta.yaml.

---

## 11. Fast Onboarding Track (30 Minutes)

Objective: understand the full CAP stack quickly and become productive in local debugging.

### 11.1 Minute 0-5: Start and Inspect Runtime

1. Run cds watch.
2. Confirm service endpoints in terminal logs:
  - /api/orders
  - /api/ops
  - /api/catalog
  - /api/analytics
  - /api/integration
3. Open metadata:
  - /api/ops/$metadata
  - /api/analytics/$metadata

### 11.2 Minute 5-12: Understand the Data Contract

1. Read db/types/common-types.cds for core business types and enum semantics.
2. Read db/domain/sales-orders.cds focusing on:
  - SalesOrders aggregate root
  - compositions to children
  - OpenOrdersView and flat analytical views
3. Read db/aspects/domain-aspects.cds to see reusable model traits.

### 11.3 Minute 12-20: Understand Business Logic

1. Open srv/handlers/sales-order-service.ts to see runtime composition.
2. Step into srv/handlers/order-header-handler.ts:
  - submitOrder
  - confirmDelivery
  - logicalDelete
3. Step into srv/handlers/order-item-handler.ts:
  - addToDelivery
  - header netAmount synchronization

### 11.4 Minute 20-25: Understand Fiori Binding

1. Open app/salesorder-listview/webapp/manifest.json for transactional navigation.
2. Open app/salesorder-analytics-alp/webapp/manifest.json for ALP startup configuration.
3. Open srv/services/annotations.ui.cds and match:
  - SelectionFields
  - LineItem
  - Chart and SelectionPresentationVariant

4. Open srv/services/annotations.analytics.cds and match:
  - Analytics.Dimension / Analytics.Measure
  - Measures.ISOCurrency and aggregation semantics

### 11.5 Minute 25-30: Run a Full Trace

1. Trigger one read on OpenOrdersQuery from ALP.
2. Watch generated OData query in logs.
3. Place breakpoint in srv/server.ts and handler methods as needed.
4. Confirm database values for key fields (status, netAmount, currency, salesOrgCode).

Expected outcome: developer can navigate model, service, UI annotation, and handler flow end-to-end.

---

## 12. Advanced Debugging Track (Production-Oriented)

Objective: quickly isolate regressions across authorization, OData metadata, handlers, data, and integrations.

### 12.1 Triage Matrix

- Symptom: action fails with 403 or hidden action button
  - Check service and action restrictions in srv/services/sales-order-service.cds
  - Check scopes and role templates in xs-security.json

- Symptom: ALP chart says invalid data or mixed units
  - Check @Measures.ISOCurrency mapping in srv/services/annotations.analytics.cds
  - Check SelectionVariant and chart dimensions in srv/services/annotations.ui.cds

- Symptom: filter accepts value length N but grid shows N+1
  - Check canonical type in db/types/common-types.cds
  - Check seed and persisted data values under db/data

- Symptom: lifecycle action updates state but dependent values remain stale
  - Check status transitions in srv/lib/status-machine.ts
  - Check after/before hooks in srv/handlers/order-header-handler.ts and srv/handlers/order-item-handler.ts

- Symptom: integration import succeeds partially or with drift
  - Check orchestrator flow in srv/integration/import-orchestrator.ts
  - Check source clients in srv/integration/northwind-client.ts and srv/integration/rest-client.ts

- Symptom: xsuaa service creation fails with "Unrecognized field" parsing xs-security.json
  - oauth2-configuration fields must be camelCase (tokenValidity, refreshTokenValidity),
    not kebab-case (token-validity, refresh-validity) - kebab-case is only used in mta.yaml
    build/module keys, not inside the XSUAA broker's own config schema

- Symptom: app crashes on boot with "Cannot find module '@cap-js/hana'"
  - The HANA driver is not a transitive dependency of @sap/cds - it must be an explicit
    entry in package.json dependencies (not devDependencies) for production/HANA profile
  - Local development against SQLite (@cap-js/sqlite in devDependencies) does not
    surface this - only a real HANA deploy does

- Symptom: app crashes on boot with "Cannot find module '@sap/xb-msg-amqp-v100'"
  - package.json cds.requires.messaging.[production] references
    enterprise-messaging-shared, but no Event Mesh service is bound in mta.yaml
  - Fix without touching the shared package.json: override via env var in the mta.yaml
    module's properties block - CDS_REQUIRES_MESSAGING_KIND: file-based-messaging

- Symptom: db-deployer fails with "inserted value too large for column"
  - A seed CSV value exceeds the CDS-declared String(N) length for that field
  - SQLite (local dev) is lenient about string length; HANA enforces it strictly -
    this only surfaces on a real HANA deploy, never against cds watch locally
  - Fix the seed data to match the real-world domain value (e.g. SAP MTART code
    HALB, 4 chars) rather than widening the CDS type to accommodate a typo

### 12.2 Breakpoint Strategy by Layer

1. Entry and request normalization: srv/server.ts
2. Service registration and route binding: srv/handlers/sales-order-service.ts
3. Domain invariants and transitions: srv/lib/validations.ts, srv/lib/status-machine.ts
4. Persistence writes and event emission: srv/handlers/order-header-handler.ts, srv/lib/events.ts
5. Messaging consumer idempotency: srv/handlers/event-consumer-handler.ts

### 12.3 Production Readiness Checks

1. Verify production profiles in package.json:
  - db kind hana
  - auth kind xsuaa
  - messaging enterprise-messaging-shared
2. Verify deployment descriptors in mta.yaml and xs-security.json are aligned.
3. Validate no conflicting annotations across app and srv layers.
4. Confirm analytical entities expose consistent measure/unit semantics.

### 12.4 Regression Guardrails

1. Add/maintain tests for state transitions and action preconditions.
2. Keep seed data aligned with CDS type lengths and enum codes.
3. Avoid duplicate annotation assignments for the same qualified term.
4. Keep service projections as the only public contract; avoid leaking domain internals.

Expected outcome: senior developer can isolate most failures within 10-20 minutes by layer-first diagnosis.
