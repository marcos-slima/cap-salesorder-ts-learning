/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/integration/marshallers.ts
 *  LAYER : Integration — Marshalling / Unmarshalling
 *
 *  This file is the DIDACTIC CORE of the integration layer.
 *  It demonstrates explicitly:
 *
 *  UNMARSHALLING (external → local CDS)
 *  ──────────────────────────────────────
 *  A) OData → CDS:  unmarshalNwOrder, unmarshalNwProduct
 *     • Strip @odata.context, @odata.type annotations
 *     • Convert PascalCase → camelCase / local field names
 *     • Convert DateTimeOffset ("1996-07-04T00:00:00Z") → Date ("1996-07-04")
 *     • Convert Northwind Decimal(10,4) → CDS Decimal(14,4)
 *     • Compute derived fields (lineTotal from qty × price × (1-discount))
 *     • Apply business rule: USD → EUR conversion on Freight
 *
 *  B) REST → CDS:   unmarshalRestProduct
 *     • Map camelCase REST names → PascalCase / local CDS names
 *     • Convert discountPercentage (0–100) → decimal fraction
 *     • Handle nullable fields (brand can be undefined)
 *
 *  MARSHALLING (local CDS → external wire format)
 *  ────────────────────────────────────────────────
 *  C) CDS → OData:  marshalOrderToOData
 *     • Add @odata.context and @odata.type annotations
 *     • Convert UUID → OrderID string
 *     • Convert camelCase CDS → PascalCase OData
 *     • Format Date → ISO-8601 DateTimeOffset string
 *
 *  D) CDS → REST:   marshalOrderToRest
 *     • Flat JSON, camelCase, no OData envelope
 *     • UUID stays as-is (used as `id`)
 *     • Null fields omitted at marshalling time
 *
 *  Business transformation rules
 *  ──────────────────────────────
 *  1. Currency conversion: Freight USD → EUR  (rate = USD_EUR_RATE)
 *  2. Line total:  quantity × unitPrice × (1 − discount)
 *  3. Order number generation: 'NW-{OrderID}' padded to 10 chars
 *  4. Product code mapping: 'NW-{ProductID:04d}' (max 8 chars → fits String(40))
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  NwOrder,
  NwOrderDetail,
  NwProduct,
  DummyJsonProduct,
  ODataOrderPayload,
  ODataOrderItemPayload,
  RestOrderPayload,
  RestOrderItemPayload
} from './types'

// ── Business rule constants ────────────────────────────────────────
/** Illustrative USD → EUR conversion rate (static for demo purposes).
 *  In production this would be fetched from an FX rate service. */
export const USD_EUR_RATE = 0.92

/** OData v4 $metadata context URL base for the marshal output */
const LOCAL_ODATA_CONTEXT = '$metadata#SalesOrders'


// ══════════════════════════════════════════════════════════════════
//  A) UNMARSHAL: OData NwOrder → shadow + local domain objects
// ══════════════════════════════════════════════════════════════════

/**
 * NorthwindOrderShadow — shape written to the NorthwindOrders shadow table.
 * Uses the raw values PLUS the computed transformed fields.
 */
export interface NorthwindOrderShadow {
  northwindOrderID:   number
  customerID:         string | null
  employeeID:         number | null
  orderDate:          string | null   // "YYYY-MM-DD" (Date string)
  requiredDate:       string | null
  shippedDate:        string | null
  freight:            number | null
  shipName:           string | null
  shipAddress:        string | null
  shipCity:           string | null
  shipRegion:         string | null
  shipPostalCode:     string | null
  shipCountry:        string | null
  freightConverted:   number | null
  convertedCurrency:  string
  conversionRate:     number
}

export interface NorthwindItemShadow {
  northwindOrderID:   number
  northwindProductID: number
  unitPrice:          number
  quantity:           number
  discount:           number
  lineTotal:          number
}

/**
 * LocalOrderCandidate — shape used to upsert into com.my.sales.SalesOrders.
 * Business key: salesOrder (string, max 10 chars)
 */
export interface LocalOrderCandidate {
  salesOrder:   string          // 'NW-10248' etc.
  orderDate:    string | null   // 'YYYY-MM-DD'
  requestedDelivDate: string | null
}

export interface LocalItemCandidate {
  itemNumber:         number
  orderQuantity:      number
  orderQuantityUnit:  string
  netAmount:          number
  // product code resolved separately
  productCode:        string    // 'NW-0011' etc.
}

/**
 * unmarshalNwOrder
 * ─────────────────
 * Converts a raw NwOrder (OData wire format) into:
 *   1. A shadow record for NorthwindOrders (stored as-is + transformed)
 *   2. An array of shadow records for NorthwindOrderItems
 *   3. A LocalOrderCandidate for upserting into SalesOrders
 *   4. An array of LocalItemCandidates for SalesOrderItems
 *
 * Type conversions performed here:
 *   DateTimeOffset "1996-07-04T00:00:00Z" → Date string "1996-07-04"
 *   Decimal(10,4)  32.38                  → stored as-is (Decimal(14,4))
 *   Single (float) 0.05                   → stored as Decimal(7,4)
 *   Freight (USD)  → freightConverted (EUR) via USD_EUR_RATE
 */
export function unmarshalNwOrder(raw: NwOrder): {
  shadow:      NorthwindOrderShadow
  itemShadows: NorthwindItemShadow[]
  localOrder:  LocalOrderCandidate
  localItems:  LocalItemCandidate[]
} {
  // ── Date conversion: DateTimeOffset → Date string ─────────────
  // OData DateTimeOffset: "1996-07-04T00:00:00Z"
  // CDS Date (stored): "1996-07-04"
  // We keep only the date portion — Northwind order times are midnight UTC
  const toDate = (iso: string | null): string | null => {
    if (!iso) return null
    return iso.split('T')[0]  // "1996-07-04T00:00:00Z" → "1996-07-04"
  }

  // ── Business rule #1: Freight USD → EUR ───────────────────────
  const freightRaw       = raw.Freight ?? 0
  const freightConverted = Math.round(freightRaw * USD_EUR_RATE * 10000) / 10000

  // ── Shadow record (stores raw + transformed values) ───────────
  const shadow: NorthwindOrderShadow = {
    northwindOrderID:   raw.OrderID,
    customerID:         raw.CustomerID ?? null,
    employeeID:         raw.EmployeeID ?? null,
    orderDate:          toDate(raw.OrderDate),
    requiredDate:       toDate(raw.RequiredDate),
    shippedDate:        toDate(raw.ShippedDate),
    freight:            raw.Freight ?? null,
    shipName:           raw.ShipName ?? null,
    shipAddress:        raw.ShipAddress ?? null,
    shipCity:           raw.ShipCity ?? null,
    shipRegion:         raw.ShipRegion ?? null,
    shipPostalCode:     raw.ShipPostalCode ?? null,
    shipCountry:        raw.ShipCountry ?? null,
    freightConverted,
    convertedCurrency:  'EUR',
    conversionRate:     USD_EUR_RATE
  }

  // ── Item shadows + local item candidates ──────────────────────
  const itemShadows: NorthwindItemShadow[] = []
  const localItems:  LocalItemCandidate[]  = []

  for (const detail of (raw.Order_Details ?? [])) {
    const itemShadow = unmarshalNwOrderDetail(detail)
    itemShadows.push(itemShadow)
    localItems.push({
      itemNumber:        detail.ProductID,   // use ProductID as item number
      orderQuantity:     detail.Quantity,
      orderQuantityUnit: 'EA',
      netAmount:         itemShadow.lineTotal,
      productCode:       `NW-${String(detail.ProductID).padStart(4, '0')}`
    })
  }

  // ── Local order candidate ─────────────────────────────────────
  // Sales order number: 'NW-10248' — must fit String(10)
  const localOrder: LocalOrderCandidate = {
    salesOrder:        `NW-${raw.OrderID}`.slice(0, 10),
    orderDate:         toDate(raw.OrderDate),
    requestedDelivDate: toDate(raw.RequiredDate)
  }

  return { shadow, itemShadows, localOrder, localItems }
}

/**
 * unmarshalNwOrderDetail
 * ───────────────────────
 * Converts a raw NwOrderDetail into a NorthwindItemShadow.
 *
 * Key transformation: lineTotal computation
 *   Northwind Discount is a Single (float) in range [0.0, 1.0]
 *   lineTotal = Quantity × UnitPrice × (1 − Discount)
 *   Result rounded to 4 decimal places.
 */
export function unmarshalNwOrderDetail(raw: NwOrderDetail): NorthwindItemShadow {
  const lineTotal = Math.round(
    raw.Quantity * raw.UnitPrice * (1 - raw.Discount) * 10000
  ) / 10000

  return {
    northwindOrderID:   raw.OrderID,
    northwindProductID: raw.ProductID,
    unitPrice:          raw.UnitPrice,
    quantity:           raw.Quantity,
    discount:           raw.Discount,
    lineTotal
  }
}

/**
 * unmarshalNwProduct
 * ───────────────────
 * Converts a raw NwProduct (OData) into a local product candidate.
 * Product code: 'NW-0011' (zero-padded to 4 digits, max 7 chars).
 */
export function unmarshalNwProduct(raw: NwProduct): {
  shadow: {
    northwindProductID: number
    productName:        string
    supplierID:         number | null
    categoryID:         number | null
    quantityPerUnit:    string | null
    unitPrice:          number | null
    unitsInStock:       number | null
    unitsOnOrder:       number | null
    discontinued:       boolean
    localProductCode:   string
  }
  localCode: string
  localName: string
} {
  const localCode = `NW-${String(raw.ProductID).padStart(4, '0')}`

  return {
    shadow: {
      northwindProductID: raw.ProductID,
      productName:        raw.ProductName,
      supplierID:         raw.SupplierID ?? null,
      categoryID:         raw.CategoryID ?? null,
      quantityPerUnit:    raw.QuantityPerUnit ?? null,
      unitPrice:          raw.UnitPrice ?? null,
      unitsInStock:       raw.UnitsInStock ?? null,
      unitsOnOrder:       raw.UnitsOnOrder ?? null,
      discontinued:       raw.Discontinued,
      localProductCode:   localCode
    },
    localCode,
    localName: raw.ProductName
  }
}


// ══════════════════════════════════════════════════════════════════
//  B) UNMARSHAL: REST DummyJsonProduct → shadow + local domain
// ══════════════════════════════════════════════════════════════════

/**
 * unmarshalRestProduct
 * ─────────────────────
 * Converts a raw DummyJsonProduct (flat REST/JSON) into a
 * RestProducts shadow record and a local product candidate.
 *
 * Structural contrast vs OData unmarshal above:
 *   • camelCase source field names (title, discountPercentage)
 *     vs OData PascalCase (ProductName, UnitPrice)
 *   • No type annotations to guide conversion — must know the schema
 *   • `brand` field may be undefined (REST has no null coercion)
 *
 * Type conversion:
 *   discountPercentage (0–100 float) → discountPct stored as-is Decimal
 *   brand undefined → null (explicit null for DB storage)
 */
export function unmarshalRestProduct(raw: DummyJsonProduct): {
  shadow: {
    externalID:      number
    title:           string
    description:     string
    price:           number
    discountPct:     number
    rating:          number
    stock:           number
    brand:           string | null
    category:        string
    localProductCode: string
  }
  localCode: string
  localName: string
} {
  const localCode = `REST-${raw.id}`

  return {
    shadow: {
      externalID:       raw.id,
      title:            raw.title,
      description:      raw.description,
      price:            raw.price,
      discountPct:      raw.discountPercentage,
      rating:           raw.rating,
      stock:            raw.stock,
      // REST/JSON: field may be absent (undefined) — convert to null for DB
      brand:            raw.brand ?? null,
      category:         raw.category,
      localProductCode: localCode
    },
    localCode,
    localName: raw.title
  }
}


// ══════════════════════════════════════════════════════════════════
//  C) MARSHAL: local CDS SalesOrder → OData v4 JSON wire format
// ══════════════════════════════════════════════════════════════════

/**
 * Shape of the local SalesOrder as read from the DB by the handler.
 * Mirrors the CDS entity — items are expanded inline.
 */
export interface LocalOrderForMarshal {
  ID:                      string
  salesOrder:              string
  orderDate?:              string | null
  netAmount?:              number | null
  transactionCurrency_code?: string | null
  overallStatus?:          string | null
  deliveryStatus?:         string | null
  items?: Array<{
    itemNumber:            number
    orderQuantity?:        number | null
    netAmount?:            number | null
    product?: { code?: string | null } | null
  }>
}

/**
 * marshalOrderToOData
 * ────────────────────
 * Serialises a local SalesOrder to the OData v4 JSON wire format.
 *
 * Marshalling operations:
 *   UUID (ID)                  → OrderID string (kept as UUID — no Northwind mapping)
 *   camelCase CDS field names  → PascalCase OData names
 *   Date "YYYY-MM-DD"          → DateTimeOffset "YYYY-MM-DDT00:00:00Z"
 *   Adds @odata.context annotation pointing to local $metadata
 *   Adds @odata.type per-entity  ("…#SalesOrders/$entity")
 *
 * This is the payload shape you would PUT/PATCH to an external
 * OData system that understands the SalesOrders entity type.
 */
export function marshalOrderToOData(order: LocalOrderForMarshal): ODataOrderPayload {
  // ── Date marshalling: Date string → DateTimeOffset ────────────
  const toDateTimeOffset = (date: string | null | undefined): string | null => {
    if (!date) return null
    // "1996-07-04" → "1996-07-04T00:00:00Z"
    return date.includes('T') ? date : `${date}T00:00:00Z`
  }

  const items: ODataOrderItemPayload[] = (order.items ?? []).map(item => ({
    '@odata.type': `#com.my.sales.SalesOrderItems/$entity`,
    ItemNumber:    item.itemNumber,
    ProductCode:   item.product?.code ?? null,
    Quantity:      item.orderQuantity ?? null,
    NetAmount:     item.netAmount ?? null
  }))

  return {
    '@odata.context': `${LOCAL_ODATA_CONTEXT}/$entity`,
    '@odata.type':    '#com.my.sales.SalesOrders/$entity',
    OrderID:          order.ID,
    SalesOrder:       order.salesOrder,
    OrderDate:        toDateTimeOffset(order.orderDate),
    NetAmount:        order.netAmount ?? null,
    Currency:         order.transactionCurrency_code ?? null,
    OverallStatus:    order.overallStatus ?? null,
    DeliveryStatus:   order.deliveryStatus ?? null,
    Items:            items
  }
}


// ══════════════════════════════════════════════════════════════════
//  D) MARSHAL: local CDS SalesOrder → REST/JSON flat format
// ══════════════════════════════════════════════════════════════════

/**
 * marshalOrderToRest
 * ───────────────────
 * Serialises a local SalesOrder to a flat REST/JSON payload.
 *
 * Marshalling operations:
 *   UUID (ID)             → id (kept as string — REST convention)
 *   camelCase kept as-is  (REST convention vs OData PascalCase)
 *   No @odata.context     (REST has no metadata envelope)
 *   Date kept as "YYYY-MM-DD" (REST has no DateTimeOffset type)
 *   null fields included  (REST consumers expect them; omit if needed)
 *
 * This is the payload you would POST/PUT to a REST endpoint.
 */
export function marshalOrderToRest(order: LocalOrderForMarshal): RestOrderPayload {
  const items: RestOrderItemPayload[] = (order.items ?? []).map(item => ({
    itemNumber:  item.itemNumber,
    productCode: item.product?.code ?? null,
    quantity:    item.orderQuantity ?? null,
    netAmount:   item.netAmount ?? null
  }))

  return {
    id:             order.ID,
    salesOrder:     order.salesOrder,
    orderDate:      order.orderDate ?? null,
    netAmount:      order.netAmount ?? null,
    currency:       order.transactionCurrency_code ?? null,
    overallStatus:  order.overallStatus ?? null,
    deliveryStatus: order.deliveryStatus ?? null,
    items
  }
}
