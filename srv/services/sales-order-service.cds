/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/services.cds
 *  LAYER : Service Model — OData Service Definitions
 *
 *  Service catalogue
 *  ─────────────────────────────────────────────────────────────────
 *  ┌─────────────────────────┬──────────────┬──────────────────────┐
 *  │ Service                 │ Path         │ Primary consumers    │
 *  ├─────────────────────────┼──────────────┼──────────────────────┤
 *  │ SalesOrderService       │ /api/orders  │ Fiori, Build Apps,   │
 *  │  (transactional)        │              │ CPI inbound          │
 *  ├─────────────────────────┼──────────────┼──────────────────────┤
 *  │ SalesCatalogService     │ /api/catalog │ F4 helpers, Joule    │
 *  │  (read-only, master)    │              │ Skills, CPI enrich.  │
 *  ├─────────────────────────┼──────────────┼──────────────────────┤
 *  │ SalesAnalyticsService   │ /api/analytics│ SAC, Datasphere,   │
 *  │  (analytical, readonly) │              │ AI Agents            │
 *  ├─────────────────────────┼──────────────┼──────────────────────┤
 *  │ SalesOperationalService │ /api/ops     │ Fiori app (full      │
 *  │  (transactional app)    │              │ transactional scope) │
 *  └─────────────────────────┴──────────────┴──────────────────────┘
 *
 *  Persistent model vs service model
 *  ────────────────────────────────────────────────────────────────
 *  db/domain/     → persistent entities and domain views (HANA DDL)
 *  db/masterdata/ → supporting sub-domain entities
 *  srv/           → OData projections; this is the API contract
 *
 *  Services always expose projections — never raw domain entities.
 *  This decouples the API contract from the persistence schema.
 *
 *  XSUAA role → CAP scope mapping
 *  ────────────────────────────────
 *  SalesProcessor  read + create/update own orders
 *  SalesManager    full CRUD + domain actions (submit, confirm…)
 *  SalesAuditor    read-only, cross-order
 *  CatalogReader   read master / reference data
 *  AnalyticsReader read analytical views
 *
 *  Declare all scopes in xs-security.json → role templates →
 *  role collections in BTP Cockpit before deploying.
 *
 *  Event Mesh integration (CAP Outbox pattern)
 *  ────────────────────────────────────────────
 *  Domain handlers emit events via cds.emit(); the CAP Outbox
 *  persists them in the same HANA transaction and delivers them
 *  asynchronously to SAP Event Mesh.  Events follow CloudEvents 1.0:
 *    type            : com.my.sales.<aggregate>.<verb>.v1
 *    source          : /btp/<subaccount>/<appname>
 *    datacontenttype : application/json
 *
 *  CPI inbound
 *  ────────────
 *  External systems (S/4HANA, EDI, legacy ERP) submit orders via
 *  Integration Suite iFlows → POST /api/orders/SalesOrders.
 *  CPI handles protocol conversion + field mapping; CAP handles
 *  business rules and persistence.
 * ═══════════════════════════════════════════════════════════════════
 */

// [FIX-01] Import aliases must be distinct when both resolve to
// the same namespace.  Using the same alias `domain` for two
// different files causes the second `using` to silently shadow the
// first — the compiler uses whichever was last parsed, making all
// references to the first import break at runtime in an opaque way.
// Distinct aliases make each source explicit and grep-friendly.
using { com.my.sales as sales }   from '../../db/domain/sales-orders';
using { com.my.sales as catalog } from '../../db/masterdata/master-data';


// ══════════════════════════════════════════════════════════════════
//  SERVICE 1 : SalesOrderService  (transactional)
// ══════════════════════════════════════════════════════════════════

/**
 * Transactional service for the SalesOrders aggregate.
 *
 * Aggregate boundary enforcement
 * ────────────────────────────────
 * Composition children (Items, ScheduleLines, ItemConditions,
 * Partners) are exposed as top-level entity sets only to support
 * cross-aggregate $filter queries (e.g. "all open items for
 * product X").  They cannot be created without a valid parent —
 * the FK association to SalesOrders is @mandatory in the domain
 * model, so CAP rejects orphan POSTs at the persistence layer.
 *
 * OData Draft
 * ────────────
 * @odata.draft.enabled activates the CAP Draft mechanism on the
 * root entity only — child entity sets must NOT carry this
 * annotation.  Draft is inherited through compositions
 * automatically; annotating children too causes double-draft
 * tables and OData metadata conflicts.
 */
@path    : '/api/orders'
@requires: ['SalesProcessor', 'SalesManager', 'SalesAuditor']
service SalesOrderService {

    // ── Aggregate root ──────────────────────────────────────────

    // @cds.redirection.target: true
    //
    // This service exposes two entity sets that both resolve to the
    // same domain entity com.my.sales.SalesOrders:
    //   • SalesOrders  — full transactional projection (this entity)
    //   • OpenOrders   — read-only view of ActiveSalesOrders, which
    //                    is itself a filtered view of SalesOrders
    //
    // When SalesOrderItems.order (Association to SalesOrders) is
    // redirected inside this service, the CAP compiler finds two
    // candidates and cannot auto-select one:
    //   "can't auto-redirect — add @cds.redirection.target to select"
    //
    // The canonical target MUST be the full transactional projection,
    // not the filtered read view.  OpenOrders omits fields required
    // for the ON-condition and for write operations.
    //
    // @cds.redirection.target: true instructs the compiler to always
    // resolve associations to com.my.sales.SalesOrders toward THIS
    // entity set, ignoring all other projections of the same source.
    @cds.redirection.target: true
    @odata.draft.enabled: true
    @restrict: [
        // SalesAuditor and SalesManager can read ALL orders cross-user.
        { grant: 'READ',
          to   : ['SalesAuditor', 'SalesManager'] },
        // SalesProcessor can only read and modify their OWN orders
        // (instance-based authorization — $user matches createdBy).
        // This follows the Clean Core principle: a sales rep cannot
        // browse or edit orders created by colleagues.
        { grant: ['READ', 'CREATE', 'UPDATE'],
          to   : 'SalesProcessor',
          where: '$user = createdBy' },
        { grant: ['CREATE', 'UPDATE'],
          to   : 'SalesManager' },
        { grant: 'DELETE',
          to   : 'SalesManager' }
    ]
    entity SalesOrders as projection on sales.SalesOrders
        // [FIX-03] `excluding` here hides EventEmitting fields from
        // the OData contract but does NOT prevent handlers from
        // reading/writing them.  The domain service (srv/sales-order-
        // service.js) writes lastEventType/lastEventAt via cds.update()
        // after commit — this is intentional and correct.
        excluding {
            lastEventType,
            lastEventAt
        }
        actions {

            // [FIX-04] Actions on a draft-enabled entity must be
            // declared as `bound action`, not `action`, to attach
            // them to the entity instance.  CAP infers `bound action`
            // automatically when declared inside `actions { }` on an
            // entity projection — no syntax change needed, but the
            // handler must use `req.params[0]` (the entity key) to
            // locate the instance, not a body parameter.

            /**
             * submitOrder
             * ────────────
             * Transitions overallStatus: Open → InProcess.
             * Pre-conditions validated by the handler:
             *   • Sold-to partner is assigned and not blocked.
             *   • Every item has at least one SalesOrderScheduleLine.
             *   • Order is not logically deleted.
             * Emits: com.my.sales.salesorder.submitted.v1
             */
            @restrict: [{ to: ['SalesProcessor', 'SalesManager'] }]
            action submitOrder()
                returns SalesOrders;

            /**
             * confirmDelivery
             * ────────────────
             * Transitions deliveryStatus → FullyDelivered and
             * computes overallStatus accordingly.
             * Restricted to SalesManager — annotated at action level,
             * which takes precedence over the entity-level @restrict.
             * Emits: com.my.sales.salesorder.delivered.v1
             */
            @restrict: [{ to: 'SalesManager' }]
            action confirmDelivery(comment : String(255))
                returns SalesOrders;

            /**
             * recalculatePricing
             * ───────────────────
             * Re-runs the pricing procedure on all items and updates
             * SalesOrderItemConditions rows and item/header netAmount.
             * Idempotent — safe to call multiple times.
             */
            @restrict: [{ to: ['SalesProcessor', 'SalesManager'] }]
            action recalculatePricing()
                returns SalesOrders;

            /**
             * logicalDelete
             * ──────────────
             * Sets deletionIndicator = 'X' on the header and all
             * owned children in a single transaction.
             * MUST be preferred over the OData DELETE verb: CAP maps
             * DELETE to a physical row removal.  The domain service
             * handler for this action performs the soft-delete and
             * then rejects any subsequent WRITE on the same ID.
             * Emits: com.my.sales.salesorder.deleted.v1
             */
            @restrict: [{ to: 'SalesManager' }]
            action logicalDelete(reason : String(255))
                returns SalesOrders;
        };

    // ── Composition children ────────────────────────────────────

    // [FIX-05] `excluding { lastEventType, lastEventAt }` on Items
    // was incorrect in the previous version: SalesOrderItems does
    // NOT extend the EventEmitting aspect in the domain model.
    // Attempting to exclude non-existent fields causes a CDS
    // compiler error ("unknown element").  Removed.

    // [FIX-06] Grant value 'WRITE' is not a valid CAP grant verb.
    // Valid verbs are: READ, CREATE, UPDATE, DELETE, WRITE* (* = alias
    // for CREATE+UPDATE+DELETE, rarely needed and avoided here because
    // it grants DELETE to SalesProcessor unintentionally).
    // All @restrict blocks below use explicit READ / CREATE / UPDATE.

    @restrict: [
        { grant: 'READ',             to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] },
        { grant: ['CREATE', 'UPDATE'], to: ['SalesProcessor', 'SalesManager'] }
    ]
    entity SalesOrderItems as projection on sales.SalesOrderItems
        actions {
            /**
             * addToDelivery
             * ──────────────
             * Flags the item for inclusion in the next outbound
             * delivery run.  When deliveryBlock = true the item is
             * blocked; when false it is released.
             * Publishes an integration event consumed by the CPI →
             * Warehouse Management iFlow.
             *
             * [FIX-07] Return type corrected from `domain.SalesOrderItems`
             * (a domain entity — not in scope inside a service definition)
             * to `SalesOrderItems` (the service projection declared above).
             * Using a domain entity as a return type exposes internal
             * fields that were intentionally excluded from the service.
             */
            action addToDelivery(deliveryBlock : Boolean)
                returns SalesOrderItems;
        };

    @restrict: [
        { grant: 'READ',             to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] },
        { grant: ['CREATE', 'UPDATE'], to: ['SalesProcessor', 'SalesManager'] }
    ]
    entity SalesOrderScheduleLines as projection on sales.SalesOrderScheduleLines;

    @restrict: [
        { grant: 'READ',             to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] },
        { grant: ['CREATE', 'UPDATE'], to: ['SalesProcessor', 'SalesManager'] }
    ]
    entity SalesOrderItemConditions as projection on sales.SalesOrderItemConditions;

    @restrict: [
        { grant: 'READ',             to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] },
        { grant: ['CREATE', 'UPDATE'], to: ['SalesProcessor', 'SalesManager'] }
    ]
    entity SalesOrderPartners as projection on sales.SalesOrderPartners;

    // ── Status / aggregate queries (do NOT expose flat item views here)
    //
    // ARCHITECTURAL RULE: flat/denormalised views derived from
    // SalesOrderItems (SalesOrderItemsFlat, ScheduleLinesFlat) must
    // NOT be exposed in the same service as the transactional
    // SalesOrderItems entity.
    //
    // Reason: when a service contains two entity sets that both
    // resolve to the same domain entity — one as the full projection
    // (SalesOrderItems) and one as a flat view (SalesOrderItemsFlat) —
    // the CAP compiler must pick one as the redirect target for the
    // `items` composition on SalesOrders.  It picks the last one
    // encountered during compilation, which is the flat view.
    // The flat view is missing the `order` field (it was renamed to
    // `salesOrderNumber`), so the ON-condition `items.order = $self`
    // cannot be resolved:
    //   "Target 'ItemsFlat' of 'items' is missing element 'order'"
    //
    // Solution: keep the flat views in SalesAnalyticsService only,
    // where SalesOrderItems is NOT exposed as a transactional entity.
    // The header-level OpenOrders view is safe here because it derives
    // from SalesOrders (the root), not from SalesOrderItems.
    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] }]
    entity OpenOrders        as projection on sales.OpenOrdersView;

    // ── Reference data (F4 value helps within this service UI) ───
    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] }]
    entity Products          as projection on catalog.Products;

    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] }]
    entity BusinessPartners  as projection on catalog.BusinessPartners;
}


// ══════════════════════════════════════════════════════════════════
//  SERVICE 2 : SalesOperationalService  (transactional app)
// ══════════════════════════════════════════════════════════════════

/**
 * Transactional app-facing service.
 *
 * This service intentionally mirrors the full transactional
 * capabilities of SalesOrderService (CRUD + bound actions), while
 * still relying on projections to keep the domain model clean.
 */
@path    : '/api/ops'
@requires: ['SalesProcessor', 'SalesManager', 'SalesAuditor']
service SalesOperationalService {

    @cds.redirection.target: true
    @odata.draft.enabled: true
    @restrict: [
        { grant: 'READ',
          to   : ['SalesAuditor', 'SalesManager'] },
        { grant: ['READ', 'CREATE', 'UPDATE'],
          to   : 'SalesProcessor',
          where: '$user = createdBy' },
        { grant: ['CREATE', 'UPDATE'],
          to   : 'SalesManager' },
        { grant: 'DELETE',
          to   : 'SalesManager' }
    ]
    entity SalesOrders as projection on sales.SalesOrders
        excluding {
            lastEventType,
            lastEventAt
        }
        actions {
            @restrict: [{ to: ['SalesProcessor', 'SalesManager'] }]
            action submitOrder()
                returns SalesOrders;

            @restrict: [{ to: 'SalesManager' }]
            action confirmDelivery(comment : String(255))
                returns SalesOrders;

            @restrict: [{ to: ['SalesProcessor', 'SalesManager'] }]
            action recalculatePricing()
                returns SalesOrders;

            @restrict: [{ to: 'SalesManager' }]
            action logicalDelete(reason : String(255))
                returns SalesOrders;
        };

    @restrict: [
        { grant: 'READ',               to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] },
        { grant: ['CREATE', 'UPDATE'], to: ['SalesProcessor', 'SalesManager'] }
    ]
    entity SalesOrderItems as projection on sales.SalesOrderItems
        actions {
            action addToDelivery(deliveryBlock : Boolean)
                returns SalesOrderItems;
        };

    @restrict: [
        { grant: 'READ',               to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] },
        { grant: ['CREATE', 'UPDATE'], to: ['SalesProcessor', 'SalesManager'] }
    ]
    entity SalesOrderScheduleLines as projection on sales.SalesOrderScheduleLines;

    @restrict: [
        { grant: 'READ',               to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] },
        { grant: ['CREATE', 'UPDATE'], to: ['SalesProcessor', 'SalesManager'] }
    ]
    entity SalesOrderItemConditions as projection on sales.SalesOrderItemConditions;

    @restrict: [
        { grant: 'READ',               to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] },
        { grant: ['CREATE', 'UPDATE'], to: ['SalesProcessor', 'SalesManager'] }
    ]
    entity SalesOrderPartners as projection on sales.SalesOrderPartners;

    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] }]
    entity OpenOrders as projection on sales.OpenOrdersView;

    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] }]
    entity Products as projection on catalog.Products;

    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesProcessor', 'SalesManager', 'SalesAuditor'] }]
    entity BusinessPartners as projection on catalog.BusinessPartners;
}


// ══════════════════════════════════════════════════════════════════
//  SERVICE 3 : SalesCatalogService  (master data, read-only)
// ══════════════════════════════════════════════════════════════════

/**
 * Read-only master / reference data service.
 *
 * [FIX-09] `authenticated-user` in the @requires list of a service
 * that also lists explicit roles creates a security hole:
 * ANY authenticated BTP user can access all entity sets —
 * the role-based entries become irrelevant decorations.
 * `authenticated-user` is the least-privileged catch-all; once
 * present it takes effect for ALL requests regardless of other roles.
 *
 * Decision: Remove `authenticated-user`.  Assign `CatalogReader`
 * role to all role collections that need catalog access, including
 * the ones that also hold SalesProcessor / SalesManager.
 * This keeps the access model explicit and auditable.
 *
 * [FIX-10] ProductPrices exposed here includes `amount` (list price).
 * This is intentional for the catalog service — buyers need to see
 * list prices.  If price confidentiality is required, add a
 * projection that excludes `amount` and exposes it only to
 * SalesManager via a separate entity set or the SalesOrderService.
 */
@path    : '/api/catalog'
@requires: ['CatalogReader', 'SalesProcessor', 'SalesManager', 'SalesAuditor']
service SalesCatalogService {

    @readonly entity Products               as projection on catalog.Products;
    @readonly entity ProductTypes           as projection on catalog.ProductTypes;
    @readonly entity ProductPrices          as projection on catalog.ProductPrices;
    @readonly entity BusinessPartners       as projection on catalog.BusinessPartners;
    @readonly entity SalesOrganizations     as projection on catalog.SalesOrganizations;
    @readonly entity SalesAreas             as projection on catalog.SalesAreas;
    @readonly entity DistributionChannels   as projection on catalog.DistributionChannels;
    @readonly entity Divisions              as projection on catalog.Divisions;
    @readonly entity SalesOrderTypes        as projection on catalog.SalesOrderTypes;
    @readonly entity ConditionTypes         as projection on catalog.ConditionTypes;
    @readonly entity ScheduleLineCategories as projection on catalog.ScheduleLineCategories;
}


// ══════════════════════════════════════════════════════════════════
//  SERVICE 4 : SalesAnalyticsService  (analytical, read-only)
// ══════════════════════════════════════════════════════════════════

/**
 * Analytical service for SAC, Datasphere, and AI agent consumption.
 *
 * @Analytics.query: true
 * ──────────────────────
 * Marks the entity as a CDS Analytics Query (mirrors CDS Analytical
 * View with analytical annotations in ABAP CDS).  CAP surfaces it
 * as an OData v4 entity with $apply support, allowing SAC and
 * Datasphere to push GROUP BY / aggregation to HANA rather than
 * pulling raw rows.
 *
 * Dimension vs Measure annotations
 * ──────────────────────────────────
 * For @Analytics.query entities, every field must be classified:
 *   @Analytics.Dimension: true  — groupable, filterable attribute
 *   @Analytics.Measure:   true  — aggregatable numeric field
 * Without these annotations SAC treats all fields as dimensions
 * and $apply aggregation ($apply=aggregate(netAmount with sum))
 * returns incorrect results.
 *
 * [FIX-11] The original projection on OpenOrdersView used `{ *, transactionCurrency }`
 * which is invalid CDS syntax: `*` already includes all fields of the
 * source; adding a field that is already part of `*` causes a
 * "duplicate element" compiler error.
 * Correct approach: use `{ * }` or list fields explicitly.
 * Since OpenOrdersView already includes transactionCurrency, `{ * }`
 * is the correct and complete projection.
 *
 * [FIX-12] ItemRevenueQuery: the `where` clause on a service
 * projection is evaluated at OData query time, not at DDL creation
 * time.  This means it adds a runtime WHERE condition to every
 * $apply call.  While functionally correct, it duplicates the
 * filter already present in SalesOrderItemsFlat (the source view
 * filters deletionIndicator = ' ').  Double-filtering is harmless
 * but misleading — removed to keep the projection honest.
 */
@path    : '/api/analytics'
@requires: ['AnalyticsReader', 'SalesManager', 'SalesAuditor']
service SalesAnalyticsService {

    /**
     * OpenOrdersQuery
     * ────────────────
     * Header-level open order KPIs: revenue by sales org, customer,
     * delivery status.  Primary dataset for SAC story creation.
     *
     * @odata.maxpagesize: 1000
     * Prevents unbounded result sets from saturating memory or
     * downstream analytics pipelines.  SAC and Datasphere paginate
     * automatically; clients that need all rows must iterate $skiptoken.
     */
    @readonly
    @Analytics.query: true
    @Aggregation.ApplySupported: {
        $Type: 'Aggregation.ApplySupportedType',
        Transformations: ['aggregate', 'groupby', 'filter', 'identity', 'orderby', 'skip', 'top', 'concat'],
        AggregatableProperties: [
            {
                $Type   : 'Aggregation.AggregatablePropertyType',
                Property: netAmount
            }
        ],
        GroupableProperties: [
            salesOrgCode,
            deliveryStatus,
            billingStatus,
            overallStatus,
            orderDate,
            salesOrder,
            soldToName,
            transactionCurrency_code
        ],
        Rollup: #None,
        PropertyRestrictions: false
    }
    @odata.maxpagesize: 1000
    entity OpenOrdersQuery as projection on sales.OpenOrdersView {
        key ID,
        salesOrder,
        orderDate,
        requestedDelivDate,
        salesOrgCode,
        distributionChannelCode,
        soldToName,
        netAmount as netAmount,
        transactionCurrencyCode as transactionCurrency_code,
        overallStatus as overallStatus,
        deliveryStatus as deliveryStatus,
        billingStatus as billingStatus
    };

    /**
     * ItemRevenueQuery
     * ─────────────────
     * Item-level revenue breakdown.  Supports drill-down from
     * header totals to product / customer combinations in SAC.
     */
    @readonly
    @Analytics.query: true
    @Aggregation.ApplySupported: {
        $Type: 'Aggregation.ApplySupportedType',
        Transformations: ['aggregate', 'groupby', 'filter'],
        Rollup: #None,
        PropertyRestrictions: true
    }
    @odata.maxpagesize: 1000
    entity ItemRevenueQuery as projection on sales.SalesOrderItemsFlat {
        *
    };

    /**
     * DeliveryScheduleQuery
     * ──────────────────────
     * Schedule line fulfilment data.  Used to compute on-time
     * delivery KPI: confirmed vs requested quantity, by date.
     */
    @readonly
    @Analytics.query: true
    @Aggregation.ApplySupported: {
        $Type: 'Aggregation.ApplySupportedType',
        Transformations: ['aggregate', 'groupby', 'filter'],
        Rollup: #None,
        PropertyRestrictions: true
    }
    @odata.maxpagesize: 1000
    entity DeliveryScheduleQuery as projection on sales.ScheduleLinesFlat {
        *
    };

    // ── Flat operational views (safe here: no transactional SalesOrderItems) ──
    //
    // These views are derived from SalesOrderItems but do NOT expose the
    // transactional entity itself.  No composition redirect conflict arises
    // because SalesOrderItems is not declared as a top-level entity set in
    // this service — the CAP compiler has no ambiguity about the redirect
    // target for the `items` composition.
    //
    // Consumers: Fiori list reports, Build Apps dashboards, Joule queries.
    @readonly
    @restrict: [{ grant: 'READ', to: ['AnalyticsReader', 'SalesManager', 'SalesAuditor',
                                      'SalesProcessor'] }]
    entity ItemsFlat         as projection on sales.SalesOrderItemsFlat;

    @readonly
    @restrict: [{ grant: 'READ', to: ['AnalyticsReader', 'SalesManager', 'SalesAuditor',
                                      'SalesProcessor'] }]
    entity ScheduleLinesFlat as projection on sales.ScheduleLinesFlat;
}



