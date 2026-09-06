/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : db/domain/sales-orders.cds
 *  LAYER : Domain Model — Core Domain (Sales Bounded Context)
 *
 *  DDD Aggregate design
 *  ─────────────────────
 *  SalesOrders is the AGGREGATE ROOT.  All access to child
 *  entities (items, schedule lines, conditions, partners) MUST
 *  go through the root.  This is enforced architecturally by:
 *    • Using Composition (not Association) for all owned children.
 *    • Exposing children in services only as navigation from the
 *      root (SalesOrders/Items), never as top-level entity sets.
 *    • Domain actions (submitOrder, confirmDelivery) are placed
 *      on the root, not on child entities.
 *
 *  Aggregate boundary
 *  ──────────────────
 *  INSIDE aggregate (Composition, owned lifecycle):
 *    SalesOrderItems
 *    SalesOrderItemConditions
 *    SalesOrderScheduleLines
 *    SalesOrderPartners
 *    SalesOrderTexts
 *
 *  OUTSIDE aggregate (Association, independent lifecycle):
 *    Products          → Product sub-domain
 *    BusinessPartners  → Partner sub-domain
 *    SalesAreas        → OrgStructure sub-domain
 *    SalesOrderTypes   → Code list
 *
 *  Invariants enforced by domain handlers (srv layer)
 *  ──────────────────────────────────────────────────
 *  1. Net amount on header = sum of item net amounts.
 *  2. An order cannot be submitted (status Open → InProcess)
 *     unless all items have at least one schedule line.
 *  3. DeliveryStatus is computed, never set directly.
 *  4. A logically deleted order cannot be modified.
 *
 *  Event catalogue (SAP Event Mesh)
 *  ─────────────────────────────────
 *  com.my.sales.salesorder.created.v1
 *  com.my.sales.salesorder.submitted.v1
 *  com.my.sales.salesorder.delivered.v1
 *  com.my.sales.salesorder.deleted.v1
 *  com.my.sales.salesorder.item.added.v1
 * ═══════════════════════════════════════════════════════════════════
 */

namespace com.my.sales;

using { Currency, managed, cuid }           from '@sap/cds/common';
using { com.my.sales.SalesOrderNumber,
        com.my.sales.SalesOrderItemPos,
        com.my.sales.UnitOfMeasure,
        com.my.sales.ConditionCalculationType,
        com.my.sales.BusinessPartnerRole }   from '../types/common-types';
using { com.my.sales.SoftDeletable,
        com.my.sales.StatusTracked,
        com.my.sales.EventEmitting }         from '../aspects/domain-aspects';
using { com.my.sales.Products,
        com.my.sales.BusinessPartners,
        com.my.sales.BusinessPartnerAddresses,
        com.my.sales.SalesAreas,
        com.my.sales.SalesOrderTypes,
        com.my.sales.ConditionTypes,
        com.my.sales.ScheduleLineCategories }        from '../masterdata/master-data';


// ══════════════════════════════════════════════════════════════════
//  AGGREGATE ROOT : SalesOrders (VBAK)
// ══════════════════════════════════════════════════════════════════

/**
 * SalesOrders — Sales Order Header
 *
 * Modelling decisions
 *  ───────────────────
 *  • cuid       → UUID primary key (stable FK target for children)
 *  • managed    → createdAt/By, modifiedAt/By via CAP
 *  • SoftDeletable → logical deletion (LOEKZ / LIFSK)
 *  • StatusTracked → overallStatus / deliveryStatus / billingStatus
 *                    (all @readonly, computed by domain handlers)
 *  • EventEmitting → lastEventType / lastEventAt for Event Mesh
 *
 *  @assert.unique on salesOrder enforces the VBELN business key
 *  uniqueness at the database level (unique index on HANA).
 *
 *  SAP-standard partner function design
 *  ──────────────────────────────────────
 *  Rather than flattening soldToParty / shipToParty / billToParty
 *  as three separate FKs (which breaks when a 4th role appears),
 *  we use a SalesOrderPartners composition table (VBPA pattern).
 *  Convenience associations `soldTo`, `shipTo` are declared as
 *  filtered views over the partners table for direct navigation.
 */
// @cap-js/change-tracking — registra campo a campo cada alteração feita
// nos pedidos.  O plugin adiciona a entidade Changes ao serviço e uma
// aba "Change History" ao Object Page do Fiori Elements automaticamente.
// Não requer nenhum handler manual — o plugin intercepta os WRITE hooks.
@title           : '{i18n>SalesOrder}'
@assert.unique   : { vbeln: [salesOrder] }
@ChangeTracking
entity SalesOrders : managed, cuid, SoftDeletable, StatusTracked, EventEmitting {

    // ── Business key ────────────────────────────────────────────
    @title       : '{i18n>SalesOrderNumber}'
    @description : 'Sales document number (VBELN)'
    @mandatory
    salesOrder          : SalesOrderNumber;

    // ── Classification ──────────────────────────────────────────
    salesOrderType      : Association to one SalesOrderTypes;

    /** Single association to SalesAreas replaces 3 separate FK fields */
    salesArea           : Association to one SalesAreas;

    // ── Dates ────────────────────────────────────────────────────
    @title       : '{i18n>OrderDate}'
    @description : 'Document date (AUDAT)'
    orderDate           : Date;

    @title       : '{i18n>RequestedDeliveryDate}'
    @description : 'Requested delivery date (VDATU)'
    requestedDelivDate  : Date;

    @description : 'Pricing date (PRSDT)'
    pricingDate         : Date;

    // ── Financials ───────────────────────────────────────────────
    @title                   : '{i18n>NetAmount}'
    @description             : 'Net order value (NETWR) — computed from items'
    @Measures.ISOCurrency    : transactionCurrency_code
    @readonly
    @Core.Computed
    netAmount           : Decimal(15, 2);

    @title       : '{i18n>TransactionCurrency}'
    @description : 'Document currency (WAERK)'
    transactionCurrency : Currency;

    // ── Reference documents ──────────────────────────────────────
    @description : 'Customer purchase order number (BSTNK)'
    purchaseOrderNumber : String(35);

    @description : 'Customer purchase order date (BSTDK)'
    purchaseOrderDate   : Date;

    // ── Children (aggregate-owned, Composition) ──────────────────
    /**
     * Items are the primary children.  All navigation to schedule
     * lines and conditions goes through items, matching VBAK→VBAP
     * hierarchy and preventing orphaned child records.
     */
    items               : Composition of many SalesOrderItems
                              on items.order = $self;

    /**
     * Partner functions (VBPA pattern).
     * soldTo / shipTo / billTo are filtered convenience shortcuts.
     */
    partners            : Composition of many SalesOrderPartners
                              on partners.order = $self;

    /** Free-form text lines (VBBK / STXL pattern) */
    texts               : Composition of many SalesOrderHeaderTexts
                              on texts.order = $self;

    // ── Convenience navigation (filtered associations) ────────────
    /**
     * These are NOT separate FK columns.  They navigate to the
     * partners composition using a filter, so no data duplication.
     * Usage: SELECT FROM SalesOrders { soldTo.name } WHERE …
     */
    soldTo              : Association to one SalesOrderPartners
                              on  soldTo.order    = $self
                              and soldTo.role     = 'AG';

    shipTo              : Association to one SalesOrderPartners
                              on  shipTo.order    = $self
                              and shipTo.role     = 'WE';

    billTo              : Association to one SalesOrderPartners
                              on  billTo.order    = $self
                              and billTo.role     = 'RE';
}


// ══════════════════════════════════════════════════════════════════
//  AGGREGATE CHILD : SalesOrderPartners (VBPA)
// ══════════════════════════════════════════════════════════════════

/**
 * SalesOrderPartners
 *
 * Implements the SAP VBPA partner-function pattern.
 * One row per (order, role) pair.  This design means:
 *   • Adding a new partner role requires NO schema change.
 *   • A single BP can play multiple roles on the same order.
 *   • Ship-to address can differ from BP default address.
 *
 * @PersonalData.EntitySemantics: 'DataSubjectDetails'
 *   → esta entidade contém o snapshot do nome do parceiro no momento
 *     do pedido (partnerName).  O plugin de audit-logging rastreia
 *     leituras deste campo como acesso a dado pessoal.
 *     O DataSubjectID aqui é o partner_ID (FK para BusinessPartners).
 */
@PersonalData.EntitySemantics: 'DataSubjectDetails'
entity SalesOrderPartners : managed {
    key order           : Association to one SalesOrders;
    key role            : BusinessPartnerRole;

    @PersonalData.FieldSemantics: 'DataSubjectID'
    partner             : Association to one BusinessPartners;

    address             : Association to one BusinessPartnerAddresses;

    @PersonalData.IsPotentiallyPersonal
    partnerName         : String(80);
}


// ══════════════════════════════════════════════════════════════════
//  AGGREGATE CHILD : SalesOrderHeaderTexts
// ══════════════════════════════════════════════════════════════════

/**
 * SalesOrderHeaderTexts — free-form text objects on the header.
 * Mirrors SAP STXL / VBBK text ID pattern.
 */
entity SalesOrderHeaderTexts : managed {
    key order       : Association to one SalesOrders;
    key textId      : String(4);    // e.g. ZINT (internal note), ZEXT (external)
    language        : String(2);    // ISO language
    text            : LargeString;
}


// ══════════════════════════════════════════════════════════════════
//  AGGREGATE CHILD : SalesOrderItems (VBAP)
// ══════════════════════════════════════════════════════════════════

/**
 * SalesOrderItems — Line items
 *
 * Key design
 * ──────────
 * SalesOrderItems uses a SURROGATE UUID key (via `cuid`) as its
 * own primary key, NOT a composite key of (order_ID + itemNumber).
 *
 * Why this matters — the "composite FK cascade" problem
 * ──────────────────────────────────────────────────────
 * When a grandchild entity (SalesOrderScheduleLines,
 * SalesOrderItemConditions, SalesOrderItemTexts) references
 * SalesOrderItems via a structured FK { order, itemNumber }, the
 * CAP compiler must be able to redirect that association through
 * every projection of the parent entity — including flat views
 * like SalesOrderItemsFlat.  Flat views do NOT expose the `order`
 * FK field (it is deliberately omitted to avoid confusion with the
 * renamed column `salesOrderNumber`).  This breaks the redirect:
 *
 *   [ERROR] Can't redirect association "item", as redirection
 *   target "SalesOrderItemsFlat" does not project element "order"
 *
 * The correct CAP pattern for grandchild entities is:
 *   • SalesOrderItems gets its own surrogate UUID key via `cuid`.
 *   • Grandchildren reference it with a SIMPLE association:
 *       key item : Association to one SalesOrderItems;
 *   • CAP generates a single FK column (item_ID : UUID) in the
 *     grandchild table — no composite FK, no redirect problem.
 *   • The business key pair (order + itemNumber) is still present
 *     for ABAP-interop queries; it just isn't the physical PK.
 *
 * higherLevelItem self-association (UEPOS / BOM sub-items)
 * ─────────────────────────────────────────────────────────
 * With the surrogate key, the self-association simplifies to a
 * plain UUID FK — no structured FK needed.
 */
@title : '{i18n>SalesOrderItem}'
entity SalesOrderItems : managed, cuid, SoftDeletable {

    // ── Parent reference (FK to aggregate root) ──────────────────
    /**
     * `order` is a simple UUID FK generated by `cuid` on
     * SalesOrders.  CAP creates column `order_ID UUID` in HANA.
     * The Composition back-link on SalesOrders.items keeps the
     * lifecycle managed correctly.
     */
    order               : Association to one SalesOrders;

    // ── Business key (for ABAP-interop, NOT the physical PK) ─────
    @title       : '{i18n>ItemNumber}'
    @description : 'Item number (POSNR)'
    @mandatory
    itemNumber          : SalesOrderItemPos;

    // ── Product ─────────────────────────────────────────────────
    @mandatory
    product             : Association to one Products;

    // ── Quantities ───────────────────────────────────────────────
    @title                : '{i18n>OrderQuantity}'
    @description          : 'Order quantity (KWMENG)'
    @Measures.Unit        : orderQuantityUnit
    orderQuantity         : Decimal(13, 3);

    @title       : '{i18n>OrderQuantityUnit}'
    orderQuantityUnit     : UnitOfMeasure;

    // ── Pricing ──────────────────────────────────────────────────
    @title                   : '{i18n>NetAmount}'
    @description             : 'Net item value (NETWR) — computed from conditions'
    @Measures.ISOCurrency    : transactionCurrency_code
    @readonly
    @Core.Computed
    netAmount               : Decimal(15, 2);
    transactionCurrency     : Currency;

    // ── Sub-item support (BOM / UEPOS) ───────────────────────────
    /**
     * Self-association to the parent item within the same order.
     * With the surrogate key this is a simple UUID FK — the
     * structured FK { order, itemNumber } is no longer needed and
     * would re-introduce the composite FK cascade problem.
     * Null = top-level item.
     */
    higherLevelItem         : Association to one SalesOrderItems;

    // ── Owned children ───────────────────────────────────────────
    conditions              : Composition of many SalesOrderItemConditions
                                  on conditions.item = $self;

    scheduleLines           : Composition of many SalesOrderScheduleLines
                                  on scheduleLines.item = $self;

    texts                   : Composition of many SalesOrderItemTexts
                                  on texts.item = $self;
}


// ══════════════════════════════════════════════════════════════════
//  AGGREGATE CHILD : SalesOrderItemConditions (KONV)
// ══════════════════════════════════════════════════════════════════

/**
 * SalesOrderItemConditions — pricing conditions per item.
 *
 * `key item` is now a SIMPLE association to SalesOrderItems.
 * CAP generates column `item_ID UUID`.  No composite FK, no
 * redirect problem in views.
 *
 * The `conditionType` association to the ConditionTypes code list
 * gives Fiori a value list (F4 help) for free.
 */
entity SalesOrderItemConditions : managed {

    // Simple UUID FK — resolves the structured FK cascade problem.
    key item                : Association to one SalesOrderItems;
    key conditionStep       : Integer;          // STUNR — sequence within item

    conditionType           : Association to one ConditionTypes;

    @Measures.ISOCurrency   : conditionCurrency_code
    conditionRate           : Decimal(11, 2);   // KBETR
    conditionCurrency       : Currency;

    @Measures.ISOCurrency   : conditionCurrency_code
    conditionValue          : Decimal(15, 2);   // KWERT (calculated)

    @Measures.Unit          : conditionQuantityUnit
    conditionBase           : Decimal(13, 3);   // KPEIN (pricing basis qty)
    conditionQuantityUnit   : UnitOfMeasure;

    calculationType         : ConditionCalculationType;

    /** True = condition is for reporting only, does not change net */
    statisticalFlag         : Boolean default false;
}


// ══════════════════════════════════════════════════════════════════
//  AGGREGATE CHILD : SalesOrderScheduleLines (VBEP)
// ══════════════════════════════════════════════════════════════════

/**
 * SalesOrderScheduleLines — delivery schedule per item.
 *
 * Multiple schedule lines per item allow split deliveries on
 * different dates (e.g. 50 units on 2025-06-01, 50 on 2025-07-01).
 *
 * `key item` is a SIMPLE UUID FK to SalesOrderItems (surrogate key).
 * The previous structured FK { order, itemNumber } caused the
 * redirect error when CAP tried to match it against the flat view
 * SalesOrderItemsFlat (which does not expose `order`).
 */
@title : '{i18n>ScheduleLine}'
entity SalesOrderScheduleLines : managed {

    // Simple UUID FK — single column item_ID in HANA.
    key item                : Association to one SalesOrderItems;

    @description : 'Schedule line counter (ETENR)'
    key scheduleLineNo      : Integer;

    // ── Delivery dates ───────────────────────────────────────────
    @title       : '{i18n>DeliveryDate}'
    @description : 'Confirmed delivery date (EDATU)'
    @mandatory
    deliveryDate            : Date;

    // ── Quantities ───────────────────────────────────────────────
    @description      : 'Confirmed quantity (WMENG)'
    @Measures.Unit    : quantityUnit
    confirmedQty      : Decimal(13, 3);

    @description      : 'Requested quantity (BMENG) — may differ from confirmed'
    @Measures.Unit    : quantityUnit
    requestedQty      : Decimal(13, 3);

    quantityUnit      : UnitOfMeasure;

    // ── Classification ───────────────────────────────────────────
    scheduleLineCategory    : Association to one ScheduleLineCategories;

    // ── MRP / ATP reference ──────────────────────────────────────
    @description : 'MRP element — references purchase req. or prod. order'
    mrpElement              : String(20);
}


// ══════════════════════════════════════════════════════════════════
//  AGGREGATE CHILD : SalesOrderItemTexts
// ══════════════════════════════════════════════════════════════════

/**
 * SalesOrderItemTexts — free-form text objects on items.
 *
 * `key item` is a SIMPLE UUID FK to SalesOrderItems.
 * The previous structured FK { order, itemNumber } was the direct
 * cause of the compiler error reported in the issue header.
 */
entity SalesOrderItemTexts : managed {
    // Simple UUID FK — single column item_ID in HANA.
    key item        : Association to one SalesOrderItems;
    key textId      : String(4);
    language        : String(2);
    text            : LargeString;
}


// ══════════════════════════════════════════════════════════════════
//  PROJECTED VIEWS (Domain-layer read models)
// ══════════════════════════════════════════════════════════════════

/**
 * ActiveSalesOrders — base view excluding logically deleted records.
 * All service projections should build on top of this view, not
 * on the raw entity, to avoid accidental exposure of deleted data.
 */
view ActiveSalesOrders as
    select from SalesOrders;

/**
 * OpenOrdersView — orders pending delivery.
 * Used by dashboards, Joule skills, and integration triggers.
 */
view OpenOrdersView as
    select from ActiveSalesOrders {
        key ID,
        salesOrder,
        orderDate,
        requestedDelivDate,
        salesArea.salesOrganization.code    as salesOrgCode,
        salesArea.distributionChannel.code  as distributionChannelCode,
        soldTo.partnerName                  as soldToName,
        netAmount,
        transactionCurrency,
        transactionCurrency.code            as transactionCurrencyCode,
        overallStatus,
        deliveryStatus,
        billingStatus
    }
    where deliveryStatus <> 'C';

/**
 * SalesOrderItemsFlat — denormalised item view for list reports.
 * Fiori list pages consume this to avoid deep $expand chains.
 */
view SalesOrderItemsFlat as
    select from SalesOrderItems {
        // ID must be projected so that the CAP compiler can redirect
        // associations from grandchild entities (SalesOrderItemConditions,
        // SalesOrderScheduleLines, SalesOrderItemTexts) through this view.
        // The FK column on grandchildren is `item_ID UUID`; without `ID`
        // here the compiler raises:
        //   "Can't redirect association 'item' — target does not project ID"
        key ID,
        order.salesOrder         as salesOrderNumber,
        itemNumber,
        order.orderDate,
        order.deliveryStatus     as headerDeliveryStatus,
        order.soldTo.partnerName as soldToName,
        product.code             as productCode,
        product.name             as productName,
        order.salesArea.salesOrganization.code as salesOrgCode,
        order.salesArea.distributionChannel.code as distributionChannelCode,
        orderQuantity,
        orderQuantityUnit,
        netAmount,
        transactionCurrency,
        deletionIndicator
    };

/**
 * ScheduleLinesFlat — combined header + item + schedule line view.
 * Used by delivery due-list / shipping workbench scenarios.
 */
view ScheduleLinesFlat as
    select from SalesOrderScheduleLines {
        key scheduleLineNo,
        item.order.salesOrder           as salesOrderNumber,
        item.itemNumber,
        item.product.code               as productCode,
        item.product.name               as productName,
        deliveryDate,
        confirmedQty,
        requestedQty,
        quantityUnit,
        scheduleLineCategory.code       as scheduleLineCategoryCode,
        scheduleLineCategory.name       as scheduleLineCategoryName
    };
