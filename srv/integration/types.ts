/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/integration/types.ts
 *  LAYER : Integration — External API Type Definitions
 *
 *  Contains TypeScript interfaces that mirror the wire-format of
 *  the two external APIs consumed by this service.
 *
 *  SECTION A — OData v4 (Northwind)
 *  ──────────────────────────────────
 *  OData v4 JSON format (application/json;odata.metadata=minimal)
 *  wraps every collection response in a value[] array and includes
 *  an @odata.context URL that describes the entity type.
 *
 *  Example OData response:
 *  {
 *    "@odata.context": "https://…/Northwind.svc/$metadata#Orders",
 *    "value": [
 *      {
 *        "OrderID": 10248,
 *        "CustomerID": "VINET",
 *        "OrderDate": "1996-07-04T00:00:00Z",
 *        "Freight": 32.3800,
 *        "Order_Details": [
 *          { "ProductID": 11, "UnitPrice": 14.0, "Quantity": 12, "Discount": 0 }
 *        ]
 *      }
 *    ]
 *  }
 *
 *  SECTION B — REST/JSON (dummyjson.com)
 *  ──────────────────────────────────────
 *  Plain JSON — no envelope, camelCase names, flat structure.
 *  Pagination via limit/skip (not OData $top/$skip).
 *
 *  Example REST response:
 *  {
 *    "products": [
 *      { "id": 1, "title": "iPhone 9", "price": 549.99, ... }
 *    ],
 *    "total": 100,
 *    "skip": 0,
 *    "limit": 10
 *  }
 * ═══════════════════════════════════════════════════════════════════
 */


// ══════════════════════════════════════════════════════════════════
//  SECTION A — OData v4 Northwind types
// ══════════════════════════════════════════════════════════════════

/**
 * OData v4 collection response envelope.
 * Every GET …/EntitySet returns this wrapper.
 *
 * `T` is the item type (NwOrder, NwProduct, etc.)
 */
export interface ODataCollectionResponse<T> {
  /** e.g. "https://services.odata.org/V4/Northwind/Northwind.svc/$metadata#Orders" */
  '@odata.context': string
  /** The actual data array */
  value: T[]
  /** Present when server-side paging is active (@odata.nextLink) */
  '@odata.nextLink'?: string
  /** Present when @odata.count=true requested */
  '@odata.count'?: number
}

/**
 * Northwind Order (VBAK equivalent).
 * PascalCase field names — OData convention.
 * All dates are ISO-8601 DateTimeOffset: "1996-07-04T00:00:00Z"
 */
export interface NwOrder {
  OrderID:        number
  CustomerID:     string | null
  EmployeeID:     number | null
  OrderDate:      string | null   // DateTimeOffset → ISO-8601
  RequiredDate:   string | null
  ShippedDate:    string | null
  ShipVia?:        number | null
  Freight:        number | null   // Decimal — implicitly USD
  ShipName:       string | null
  ShipAddress:    string | null
  ShipCity:       string | null
  ShipRegion:     string | null
  ShipPostalCode: string | null
  ShipCountry:    string | null
  /** Expanded via $expand=Order_Details */
  Order_Details?: NwOrderDetail[]
}

/**
 * Northwind Order_Details (VBAP equivalent).
 * Compound key: (OrderID, ProductID)
 * `Discount` is a Single (32-bit float) in OData — deserialised as number.
 */
export interface NwOrderDetail {
  OrderID:   number
  ProductID: number
  UnitPrice: number   // Decimal(10,4)
  Quantity:  number   // SmallInt
  Discount:  number   // Single [0.0 … 1.0]
}

/**
 * Northwind Product (MARA equivalent).
 */
export interface NwProduct {
  ProductID:       number
  ProductName:     string
  SupplierID:      number | null
  CategoryID:      number | null
  QuantityPerUnit: string | null
  UnitPrice:       number | null
  UnitsInStock:    number | null
  UnitsOnOrder:    number | null
  ReorderLevel:    number | null
  Discontinued:    boolean
}


// ══════════════════════════════════════════════════════════════════
//  SECTION B — REST/JSON dummyjson.com types
// ══════════════════════════════════════════════════════════════════

/**
 * dummyjson.com GET /products response.
 * Note the structural difference vs OData:
 *  - Named array key `"products"` instead of generic `"value"`
 *  - No @odata.context annotation
 *  - Pagination via `skip` / `limit` integers, not $skiptoken
 */
export interface DummyJsonProductsResponse {
  products: DummyJsonProduct[]
  total:    number
  skip:     number
  limit:    number
}

/**
 * A single product from dummyjson.com.
 * camelCase — REST/JSON convention.
 * `thumbnail` and `images` are URLs; stored but not persisted locally.
 */
export interface DummyJsonProduct {
  id:                 number
  title:              string
  description:        string
  price:              number
  discountPercentage: number
  rating:             number
  stock:              number
  brand:              string | undefined
  category:           string
  thumbnail:          string
  images:             string[]
}


// ══════════════════════════════════════════════════════════════════
//  SECTION C — Marshalling output types
// ══════════════════════════════════════════════════════════════════

/**
 * ODataOrderPayload — the shape produced by marshalOrderToOData().
 * Mirrors the OData v4 JSON wire format for a single entity.
 *
 * @odata.type is the canonical type reference from $metadata.
 * Field names are PascalCase (OData convention).
 */
export interface ODataOrderPayload {
  '@odata.context': string
  '@odata.type':    string
  OrderID:          string        // local UUID mapped to OrderID
  SalesOrder:       string
  OrderDate:        string | null // ISO-8601
  NetAmount:        number | null
  Currency:         string | null
  OverallStatus:    string | null
  DeliveryStatus:   string | null
  Items:            ODataOrderItemPayload[]
}

export interface ODataOrderItemPayload {
  '@odata.type':  string
  ItemNumber:     number
  ProductCode:    string | null
  Quantity:       number | null
  NetAmount:      number | null
}

/**
 * RestOrderPayload — the shape produced by marshalOrderToRest().
 * Flat JSON, camelCase, no OData envelope.
 */
export interface RestOrderPayload {
  id:             string        // local UUID
  salesOrder:     string
  orderDate:      string | null
  netAmount:      number | null
  currency:       string | null
  overallStatus:  string | null
  deliveryStatus: string | null
  items:          RestOrderItemPayload[]
}

export interface RestOrderItemPayload {
  itemNumber:  number
  productCode: string | null
  quantity:    number | null
  netAmount:   number | null
}


// ══════════════════════════════════════════════════════════════════
//  SECTION D — Internal transfer objects
// ══════════════════════════════════════════════════════════════════

/** Result returned by the import orchestrator to the CAP handler. */
export interface ImportResult {
  runID:            string
  source:           string
  status:           'completed' | 'failed'
  ordersImported:   number
  itemsImported:    number
  productsImported: number
  durationMs:       number
  errorMessage?:    string
}
