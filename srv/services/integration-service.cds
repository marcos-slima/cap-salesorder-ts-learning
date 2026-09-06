/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/services/integration-service.cds
 *  LAYER : Service Model — Integration Service
 *
 *  Purpose
 *  ───────
 *  Exposes the integration shadow entities (staging area) and the
 *  import actions/functions that trigger the full
 *  fetch → unmarshal → transform → persist cycle.
 *
 *  Service boundaries
 *  ──────────────────
 *  IntegrationService  /api/integration
 *    ├── Shadow entity sets (read-only — inspection / audit)
 *    │   ├── ImportRuns          — audit log of every import
 *    │   ├── NorthwindOrders     — raw OData orders
 *    │   ├── NorthwindOrderItems — raw OData order details
 *    │   ├── NorthwindProducts   — raw OData products
 *    │   └── RestProducts        — raw REST products
 *    │
 *    └── Actions / Functions
 *        ├── importFromNorthwind(maxOrders)   — OData cycle
 *        ├── importFromRest(maxProducts)      — REST cycle
 *        ├── importAll(maxOrders,maxProducts) — both sources
 *        ├── marshalOrderToOData(orderID)     — marshal local→OData
 *        └── marshalOrderToRest(orderID)      — marshal local→REST
 *
 *  Who can call what
 *  ──────────────────
 *  SalesManager  — all read + all import actions
 *  SalesAuditor  — read shadow entities, call marshal functions
 *  (no external-facing scope needed; this is an internal admin service)
 * ═══════════════════════════════════════════════════════════════════
 */

using { com.my.sales.integration as intg } from '../../db/integration/northwind-shadow';
using { com.my.sales             as sales } from '../../db/domain/sales-orders';

@path    : '/api/integration'
@requires: ['SalesManager', 'SalesAuditor']
service IntegrationService {

    // ── Shadow entity sets (read-only inspection) ─────────────────

    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesManager', 'SalesAuditor'] }]
    entity ImportRuns          as projection on intg.ImportRuns;

    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesManager', 'SalesAuditor'] }]
    entity NorthwindOrders     as projection on intg.NorthwindOrders;

    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesManager', 'SalesAuditor'] }]
    entity NorthwindOrderItems as projection on intg.NorthwindOrderItems;

    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesManager', 'SalesAuditor'] }]
    entity NorthwindProducts   as projection on intg.NorthwindProducts;

    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesManager', 'SalesAuditor'] }]
    entity RestProducts        as projection on intg.RestProducts;

    // ── Local domain entity (read-only via this service) ──────────
    // Exposes local SalesOrders so marshalling actions can return
    // the current local state alongside the serialised representation.

    @readonly
    @restrict: [{ grant: 'READ', to: ['SalesManager', 'SalesAuditor'] }]
    entity LocalOrders         as projection on sales.SalesOrders
        excluding { lastEventType, lastEventAt };


    // ── Import actions (trigger the full integration cycle) ───────

    /**
     * importFromNorthwind
     * ────────────────────
     * Fetches Orders + Order_Details + Products from the Northwind
     * OData v4 public API, unmarshals the OData envelope, applies
     * business transformations (currency conversion, total calculation),
     * writes shadow entities, then upserts local SalesOrders /
     * SalesOrderItems / Products.
     *
     * @param maxOrders  Maximum number of Orders to fetch (default 5,
     *                   max 20 — Northwind public API rate limit courtesy)
     * @returns          Summary with import run ID and record counts
     */
    @restrict: [{ to: 'SalesManager' }]
    action importFromNorthwind(maxOrders : Integer default 5)
        returns ImportSummary;

    /**
     * importFromRest
     * ───────────────
     * Fetches Products from the dummyjson.com REST API (flat JSON),
     * unmarshals the plain JSON response, maps fields to local schema,
     * writes RestProducts shadow entities, and upserts local Products.
     *
     * Demonstrates the structural contrast vs OData:
     *   REST: { "products": [...], "total": N, "skip": N, "limit": N }
     *   OData: { "@odata.context": "...", "value": [...] }
     *
     * @param maxProducts  Maximum number of products to fetch (default 10)
     */
    @restrict: [{ to: 'SalesManager' }]
    action importFromRest(maxProducts : Integer default 10)
        returns ImportSummary;

    /**
     * importAll
     * ──────────
     * Convenience action that runs both import cycles sequentially
     * and returns a combined summary.
     */
    @restrict: [{ to: 'SalesManager' }]
    action importAll(
        maxOrders   : Integer default 5,
        maxProducts : Integer default 10
    ) returns ImportSummary;


    // ── Marshal functions (serialise local entities outward) ──────

    /**
     * marshalOrderToOData
     * ────────────────────
     * Reads a local SalesOrder by ID and serialises it to the OData
     * v4 JSON wire format (application/json;odata.metadata=minimal).
     *
     * Returns the serialised JSON string so the caller can inspect
     * the envelope (@odata.context, @odata.type annotations, etc.)
     * and see how a PUT/PATCH to an external OData system would look.
     *
     * @param orderID  UUID of the local SalesOrder
     */
    @restrict: [{ to: ['SalesManager', 'SalesAuditor'] }]
    function marshalOrderToOData(orderID : UUID) returns MarshalResult;

    /**
     * marshalOrderToRest
     * ───────────────────
     * Reads a local SalesOrder by ID and serialises it as a flat
     * REST/JSON payload (no OData envelope, camelCase field names).
     *
     * @param orderID  UUID of the local SalesOrder
     */
    @restrict: [{ to: ['SalesManager', 'SalesAuditor'] }]
    function marshalOrderToRest(orderID : UUID) returns MarshalResult;


    // ── Return types ──────────────────────────────────────────────

    /**
     * ImportSummary — returned by all import actions.
     * Provides a human-readable result without requiring the caller
     * to separately query ImportRuns.
     */
    type ImportSummary {
        runID           : UUID;
        source          : String(30);
        status          : String(20);
        ordersImported  : Integer;
        itemsImported   : Integer;
        productsImported: Integer;
        durationMs      : Integer;
        errorMessage    : String;
    }

    /**
     * MarshalResult — returned by marshal functions.
     * `format`  : 'odata' | 'rest'
     * `payload` : the serialised JSON string (parse client-side)
     */
    type MarshalResult {
        orderID : UUID;
        format  : String(10);
        payload : LargeString;
    }
}
