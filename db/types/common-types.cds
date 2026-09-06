/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : db/types/common-types.cds
 *  LAYER : Domain Model — Shared Types
 *
 *  Purpose
 *  ───────
 *  Centralises every primitive alias and enum used across the
 *  Sales bounded context.  Strong aliases (e.g. SalesOrderNumber
 *  instead of String(10)) serve two purposes:
 *    1. Self-documentation — the field declares its semantic role.
 *    2. Changeability — if SAP extends VBELN to 12 chars, one line
 *       changes and the compiler propagates it everywhere.
 *
 *  Enums replace magic-string constants.  CAP compiles them to
 *  OData v4 EnumType entries, making them consumable by Fiori,
 *  Build Apps, and AI agents (Joule) without additional mapping.
 *
 *  Naming conventions
 *  ──────────────────
 *  • Type aliases  : PascalCase, no suffix  (SalesOrderNumber)
 *  • Enum types    : PascalCase + descriptive (OverallOrderStatus)
 *  • Enum members  : PascalCase              (PartiallyDelivered)
 * ═══════════════════════════════════════════════════════════════════
 */

namespace com.my.sales;

// ─── Primitive aliases ────────────────────────────────────────────

/** VBELN — 10-char sales document number */
type SalesOrderNumber   : String(10);

/** POSNR — item position as integer (avoids leading-zero confusion) */
type SalesOrderItemPos  : Integer;

/** KUNNR / LIFNR — 10-char business partner number */
type BusinessPartner    : String(10);

/** VKORG */
type SalesOrgCode       : String(4);

/** VTWEG */
type DistrChannelCode   : String(2);

/** SPART */
type DivisionCode       : String(2);

/** MATNR — internal material number */
type ProductCode        : String(40);

/** MEINS / VRKME — ISO unit of measure code */
type UnitOfMeasure      : String(3);

/** WAERS — ISO currency code (complement to Currency aspect) */
type CurrencyCode       : String(5);

/** KSCHL — condition type */
type ConditionType      : String(4);


// ─── Enum types ───────────────────────────────────────────────────

/**
 * OverallOrderStatus
 * Overall processing status at the header level (GBSTK in VBUK).
 * Governs workflow transitions; never set directly — computed by
 * the domain service from item and schedule line statuses.
 */
@assert.range
type OverallOrderStatus : String(1) enum {
    Open        = 'A';  // No processing started
    InProcess   = 'B';  // Partially processed
    Completed   = 'C';  // Fully processed
    NotRelevant = ' ';
}

/**
 * DeliveryStatus
 * Delivery processing status (LFSTK / WBSTK).
 */
@assert.range
type DeliveryStatus : String(1) enum {
    NotDelivered       = 'A';
    PartiallyDelivered = 'B';
    FullyDelivered     = 'C';
    NotRelevant        = ' ';
}

/**
 * BillingStatus
 * Billing / invoicing status (FKSTK).
 */
@assert.range
type BillingStatus : String(1) enum {
    NotBilled       = 'A';
    PartiallyBilled = 'B';
    FullyBilled     = 'C';
    NotRelevant     = ' ';
}

/**
 * DeletionIndicator
 * Logical soft-delete flag (LOEKZ).  Physical delete is forbidden
 * in S/4HANA extensions; use this flag + CAP before-handler.
 */
@assert.range
type DeletionIndicator : String(1) enum {
    Active  = ' ';
    Deleted = 'X';
}

/**
 * ScheduleLineCategory
 * Controls MRP relevance and goods-movement type (LKTYP / ETYPE).
 */
@assert.range
type ScheduleLineCategory : String(2) enum {
    StandardOrder = 'CP';  // Normal — ATP checked
    MakeToOrder   = 'CN';  // No ATP check
    ThirdParty    = 'CS';  // Purchase order triggered
}

/**
 * ConditionCalculationType
 * How a pricing condition is calculated (KRECH in KONV).
 */
@assert.range
type ConditionCalculationType : String(1) enum {
    Percentage  = 'A';
    Quantity    = 'B';
    FixedAmount = 'C';
}

/**
 * BusinessPartnerRole
 * Role a BP plays on the sales order (partner function PARVW).
 */
@assert.range
type BusinessPartnerRole : String(2) enum {
    SoldToParty  = 'AG';
    ShipToParty  = 'WE';
    BillToParty  = 'RE';
    Payer        = 'RG';
}
