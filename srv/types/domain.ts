/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/types/domain.ts
 *  LAYER : Service — TypeScript domain type definitions
 *
 *  These interfaces mirror the CDS entity definitions in:
 *    db/types/common-types.cds
 *    db/aspects/domain-aspects.cds
 *    db/domain/sales-orders.cds
 *    db/masterdata/master-data.cds
 *
 *  Usage in production
 *  ────────────────────
 *  Run `npm run typegen` to generate authoritative types from the
 *  CDS model using @sap/cds-typer.  The generated files go into
 *  @cds-models/ and are imported via the `#cds-models/*` path alias
 *  configured in tsconfig.json.
 *
 *  These manual definitions serve two purposes:
 *    1. Reference documentation — show the shape of every entity.
 *    2. Fallback — usable without running cds-typer.
 *
 *  Naming conventions match CAP's generated column names:
 *    Association `currency`  → FK column `currency_code` (String)
 *    Association `order`     → FK column `order_ID`      (UUID)
 * ═══════════════════════════════════════════════════════════════════
 */

// ─── Enum value sets ──────────────────────────────────────────────
// These correspond to CDS enum type declarations in common-types.cds.

/** GBSTK — overall processing status (VBUK) */
export type OverallOrderStatus = 'A' | 'B' | 'C' | ' '

/** LFSTK / WBSTK — delivery status */
export type DeliveryStatus = 'A' | 'B' | 'C' | ' '

/** FKSTK — billing status */
export type BillingStatus = 'A' | 'B' | 'C' | ' '

/** LOEKZ — logical delete flag */
export type DeletionIndicator = ' ' | 'X'

/** PARVW — partner function */
export type BusinessPartnerRole = 'AG' | 'WE' | 'RE' | 'RG'

/** LKTYP / ETYPE — schedule line category */
export type ScheduleLineCategory = 'CP' | 'CN' | 'CS'

/** KRECH — pricing condition calculation type */
export type ConditionCalcType = 'A' | 'B' | 'C'


// ─── Managed aspect ───────────────────────────────────────────────

/** Fields added by the CAP `managed` aspect */
interface Managed {
  createdAt?:  string | Date
  createdBy?:  string
  modifiedAt?: string | Date
  modifiedBy?: string
}


// ─── Master data ──────────────────────────────────────────────────

export interface BusinessPartner extends Managed {
  ID:          string
  code:        string   // KUNNR / LIFNR
  name:        string
  name2?:      string
  country?:    string   // ISO country code
  language?:   string   // ISO language code
  taxNumber1?: string   // STCD1
  blocked:     boolean  // AUFSD / LIFSP
}

export interface BusinessPartnerAddress extends Managed {
  ID:          string
  partner_ID:  string
  addressType?: string  // BILL / SHIP / DEFAULT
  street?:     string
  city?:       string
  postalCode?: string
  country?:    string
  isDefault?:  boolean
}

export interface Product extends Managed {
  ID:                  string
  code:                string   // MATNR
  name?:               string   // MAKTX (localized)
  description?:        string   // (localized)
  baseUnit?:           string   // MEINS
  authorizationGroup?: string   // BEGRU
  type_code?:          string   // MTART FK
}

export interface ProductPrice extends Managed {
  product_ID:       string
  priceType:        string   // LIST / SALE / COST
  amount?:          number
  currency_code?:   string
  validFrom?:       string
  validTo?:         string
}

export interface SalesOrganization extends Managed {
  ID:       string
  code:     string   // VKORG
  name?:    string   // localized
  country?: string
}


// ─── Sales Order Aggregate ────────────────────────────────────────

/**
 * SalesOrders — aggregate root (VBAK equivalent).
 *
 * CAP column-naming conventions applied:
 *   Association `transactionCurrency` → `transactionCurrency_code` (FK)
 *   Association `salesArea`          → `salesArea_ID`             (FK)
 *   Association `salesOrderType`     → `salesOrderType_code`      (FK)
 */
export interface SalesOrder extends Managed {
  // Surrogate PK (from `cuid`)
  ID: string

  // Business key — @mandatory, @assert.unique in CDS
  salesOrder: string   // VBELN

  // Classification
  salesOrderType_code?: string
  salesArea_ID?:        string

  // Dates
  orderDate?:          string   // ISO date AUDAT
  requestedDelivDate?: string   // ISO date VDATU
  pricingDate?:        string   // ISO date PRSDT

  // Financials (@readonly — computed from items)
  netAmount?:                number    // NETWR
  transactionCurrency_code?: string   // WAERK

  // Reference documents
  purchaseOrderNumber?: string   // BSTNK
  purchaseOrderDate?:   string   // BSTDK ISO date

  // Status triple (@readonly — computed by domain handlers)
  overallStatus?:  OverallOrderStatus   // GBSTK
  deliveryStatus?: DeliveryStatus       // LFSTK
  billingStatus?:  BillingStatus        // FKSTK

  // Soft delete (@UI.Hidden in CDS)
  deletionIndicator?: DeletionIndicator  // LOEKZ

  // Event Mesh metadata (@UI.Hidden, excluded from OData contract)
  lastEventType?: string
  lastEventAt?:   string | Date

  // Compositions (populated on deep reads or deep inserts)
  items?:    SalesOrderItem[]
  partners?: SalesOrderPartner[]
  texts?:    SalesOrderHeaderText[]
}

/**
 * SalesOrderItem — line item (VBAP equivalent).
 *
 * Has its own `cuid` UUID key — essential for grandchild associations
 * to work without composite FK issues (see ADR-07 in ARCHITECTURE.md).
 */
export interface SalesOrderItem extends Managed {
  // Surrogate PK (from `cuid`)
  ID: string

  // Parent FK
  order_ID: string

  // Business key — @mandatory in CDS
  itemNumber: number   // POSNR

  // Product
  product_ID?: string
  product?:    Product

  // Quantities
  orderQuantity?:     number
  orderQuantityUnit?: string   // VRKME

  // Financials (@readonly — computed from conditions)
  netAmount?:                number
  transactionCurrency_code?: string

  // Sub-item (BOM / UEPOS)
  higherLevelItem_ID?: string

  // Soft delete
  deletionIndicator?: DeletionIndicator

  // Compositions
  conditions?:    SalesOrderItemCondition[]
  scheduleLines?: SalesOrderScheduleLine[]
  texts?:         SalesOrderItemText[]
}

/**
 * SalesOrderItemCondition — pricing condition (KONV equivalent).
 * Key: (item_ID, conditionStep)
 */
export interface SalesOrderItemCondition extends Managed {
  item_ID:               string
  conditionStep:         number         // STUNR

  conditionType_code?:   string         // KSCHL FK
  conditionRate?:        number         // KBETR
  conditionCurrency_code?: string
  conditionValue?:       number         // KWERT (computed)
  conditionBase?:        number         // KPEIN
  conditionQuantityUnit?: string        // UoM for KPEIN
  calculationType?:      ConditionCalcType  // KRECH
  statisticalFlag?:      boolean        // KSTAT
}

/**
 * SalesOrderScheduleLine — delivery schedule (VBEP equivalent).
 * Key: (item_ID, scheduleLineNo)
 */
export interface SalesOrderScheduleLine extends Managed {
  item_ID:               string
  scheduleLineNo:        number         // ETENR

  deliveryDate:          string         // EDATU — @mandatory
  confirmedQty?:         number         // WMENG
  requestedQty?:         number         // BMENG
  quantityUnit?:         string         // UoM

  scheduleLineCategory_code?: ScheduleLineCategory   // LKTYP
  mrpElement?:           string         // MRP / ATP reference
}

/**
 * SalesOrderPartner — partner function (VBPA equivalent).
 * Key: (order_ID, role)
 */
export interface SalesOrderPartner extends Managed {
  order_ID:    string
  role:        BusinessPartnerRole   // PARVW

  partner_ID?: string
  partner?:    BusinessPartner

  address_ID?: string
  address?:    BusinessPartnerAddress

  /** Name snapshot at order-creation time — avoids BP JOIN for display */
  partnerName?: string
}

export interface SalesOrderHeaderText extends Managed {
  order_ID: string
  textId:   string   // e.g. ZINT / ZEXT / ZCON / ZDEL
  language: string   // ISO language code
  text:     string
}

export interface SalesOrderItemText extends Managed {
  item_ID:  string
  textId:   string
  language: string
  text:     string
}


// ─── Action request / response helpers ───────────────────────────

/** req.data for the submitOrder action (no parameters) */
export type SubmitOrderData = Record<string, never>

/** req.data for the confirmDelivery action */
export interface ConfirmDeliveryData {
  comment?: string
}

/** req.data for the logicalDelete action */
export interface LogicalDeleteData {
  reason?: string
}

/** req.data for the addToDelivery action */
export interface AddToDeliveryData {
  deliveryBlock: boolean
}
