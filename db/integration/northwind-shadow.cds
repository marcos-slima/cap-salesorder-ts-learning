/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : db/integration/northwind-shadow.cds
 *  LAYER : Domain Model — Integration Shadow Entities
 *
 *  Purpose
 *  ───────
 *  Shadow (staging) entities that store raw data imported from
 *  external systems before it is transformed and merged into the
 *  local sales domain.
 *
 *  Design principles
 *  ──────────────────
 *  1. Keep originals intact — every field from the source is stored
 *     as-is so that re-processing is always possible without
 *     re-fetching from the external system.
 *
 *  2. Explicit external keys — `northwindOrderID` (Integer) and
 *     `externalProductID` (Integer) carry the original PK from the
 *     external system. They are DIFFERENT from the local UUID PK.
 *
 *  3. Weak links to local domain — `localOrder_ID` and
 *     `localProduct_ID` are nullable UUIDs set AFTER the local
 *     entity has been created.  They allow tracing imported data
 *     back to its local counterpart without forcing a hard FK
 *     (which would break if the local entity is deleted).
 *
 *  4. Import audit trail — every shadow entity references the
 *     ImportRun that created or last updated it.
 *
 *  OData field-type notes (Northwind → CDS mapping)
 *  ──────────────────────────────────────────────────
 *  • Northwind DateTimeOffset  → CDS DateTime  (ISO-8601, no tz info kept)
 *  • Northwind Decimal(10,4)   → CDS Decimal(14,4)
 *  • Northwind SmallInt        → CDS Integer
 *  • Northwind Single (float)  → CDS Decimal(7,4)  (Discount field)
 *  • Northwind Boolean         → CDS Boolean
 * ═══════════════════════════════════════════════════════════════════
 */

namespace com.my.sales.integration;

using { managed, cuid } from '@sap/cds/common';


// ══════════════════════════════════════════════════════════════════
//  IMPORT RUN LOG
// ══════════════════════════════════════════════════════════════════

/**
 * ImportRuns — audit log of every import execution.
 *
 * Each call to an import action creates one row here.
 * Status lifecycle: 'running' → 'completed' | 'failed'
 */
entity ImportRuns : managed, cuid {
    /** Source identifier: 'northwind-odata' | 'dummyjson-rest' | 'all' */
    source          : String(30)    @mandatory;
    startedAt       : DateTime      @mandatory;
    completedAt     : DateTime;
    /** 'running' | 'completed' | 'failed' */
    status          : String(20)    default 'running';
    recordsImported : Integer       default 0;
    /** Stored when status = 'failed' */
    errorMessage    : LargeString;
}


// ══════════════════════════════════════════════════════════════════
//  NORTHWIND SHADOW ENTITIES (source: OData v4)
// ══════════════════════════════════════════════════════════════════

/**
 * NorthwindOrders — raw Northwind Order header.
 *
 * OData source entity: Orders
 * OData endpoint: /V4/Northwind/Northwind.svc/Orders
 *
 * Key mapping:
 *   Northwind.OrderID (Integer) → northwindOrderID (Integer, key)
 *
 * Date mapping (DateTimeOffset → DateTime):
 *   "1996-07-04T00:00:00Z" → "1996-07-04T00:00:00"
 *   The timezone offset is dropped; all dates stored as UTC-equivalent.
 *
 * Currency note:
 *   Northwind has no currency field — amounts are implicitly USD.
 *   The `freightConverted` field stores the value after the USD→EUR
 *   conversion applied during unmarshalling (rate stored in convRate).
 */
entity NorthwindOrders : managed {
    key northwindOrderID    : Integer;          // OrderID

    // ── Raw fields (stored as received from OData) ────────────────
    customerID              : String(5);        // CustomerID (Northwind BP code)
    employeeID              : Integer;          // EmployeeID
    orderDate               : DateTime;         // OrderDate (DateTimeOffset → DateTime)
    requiredDate            : DateTime;         // RequiredDate
    shippedDate             : DateTime;         // ShippedDate (nullable)
    freight                 : Decimal(14, 4);   // Freight (USD, raw)
    shipName                : String(40);       // ShipName
    shipAddress             : String(60);       // ShipAddress
    shipCity                : String(15);       // ShipCity
    shipRegion              : String(15);       // ShipRegion (nullable)
    shipPostalCode          : String(10);       // ShipPostalCode
    shipCountry             : String(15);       // ShipCountry

    // ── Transformed fields (applied during unmarshalling) ─────────
    /** Freight converted to EUR using the rate stored at import time */
    freightConverted        : Decimal(14, 4);
    /** ISO currency code of converted amount */
    convertedCurrency       : String(3)         default 'EUR';
    /** Exchange rate applied (e.g. 0.92 for USD→EUR) */
    conversionRate          : Decimal(7, 6);

    // ── Import metadata ───────────────────────────────────────────
    importRun               : Association to one ImportRuns;

    // ── Link to local domain entity (set after transformation) ────
    /** UUID of the local SalesOrders entity created from this import */
    localOrder_ID           : UUID;
}

/**
 * NorthwindOrderItems — raw Northwind Order_Details.
 *
 * OData source entity: Order_Details (navigation from Orders via $expand)
 * The compound key (OrderID + ProductID) is preserved as-is.
 *
 * lineTotal = Quantity × UnitPrice × (1 − Discount)
 * This is computed during unmarshalling and stored in `lineTotal`.
 */
entity NorthwindOrderItems : managed {
    key northwindOrderID    : Integer;          // OrderID (FK to Order)
    key northwindProductID  : Integer;          // ProductID (FK to Product)

    // ── Raw fields ────────────────────────────────────────────────
    unitPrice               : Decimal(14, 4);   // UnitPrice
    quantity                : Integer;          // Quantity (SmallInt)
    discount                : Decimal(7, 4);    // Discount (Single/float → Decimal)

    // ── Computed during unmarshalling ─────────────────────────────
    /** qty × unitPrice × (1 − discount), before currency conversion */
    lineTotal               : Decimal(14, 4);

    // ── Import metadata ───────────────────────────────────────────
    importRun               : Association to one ImportRuns;

    // ── Links to local domain ─────────────────────────────────────
    localItem_ID            : UUID;
}

/**
 * NorthwindProducts — raw Northwind Products.
 *
 * OData source entity: Products
 * Fetched separately from Orders to populate the local Products catalog.
 */
entity NorthwindProducts : managed {
    key northwindProductID  : Integer;          // ProductID

    // ── Raw fields ────────────────────────────────────────────────
    productName             : String(40);       // ProductName
    supplierID              : Integer;          // SupplierID
    categoryID              : Integer;          // CategoryID
    quantityPerUnit         : String(20);       // QuantityPerUnit
    unitPrice               : Decimal(14, 4);   // UnitPrice
    unitsInStock            : Integer;          // UnitsInStock (SmallInt)
    unitsOnOrder            : Integer;          // UnitsOnOrder
    discontinued            : Boolean;          // Discontinued

    // ── Import metadata ───────────────────────────────────────────
    importRun               : Association to one ImportRuns;

    // ── Link to local Products catalog ───────────────────────────
    /** code used in local Products: 'NW-{northwindProductID}' */
    localProductCode        : String(40);
    localProduct_ID         : UUID;
}


// ══════════════════════════════════════════════════════════════════
//  REST SHADOW ENTITIES (source: JSON/REST)
// ══════════════════════════════════════════════════════════════════

/**
 * RestProducts — raw products from dummyjson.com REST API.
 *
 * REST endpoint: GET https://dummyjson.com/products?limit=N&skip=N
 *
 * Structural contrast with the OData shadow above:
 *   • No @odata.context, no value[] wrapper — flat JSON array
 *   • camelCase field names (vs OData PascalCase)
 *   • Pagination via `limit` / `skip` query params (vs OData $top/$skip)
 *   • No type annotations — schema must be known in advance
 *   • `id` field is a plain integer (vs Northwind's domain-meaningful key)
 *
 * REST fields mapped to CDS:
 *   id              → externalID    (Integer)
 *   title           → title         (String)
 *   description     → description   (LargeString)
 *   price           → price         (Decimal)
 *   discountPercentage → discountPct (Decimal)
 *   rating          → rating        (Decimal)
 *   stock           → stock         (Integer)
 *   brand           → brand         (String)
 *   category        → category      (String)
 */
entity RestProducts : managed {
    key externalID      : Integer;          // id

    // ── Raw REST fields ───────────────────────────────────────────
    title               : String(100);      // title
    description         : LargeString;      // description
    price               : Decimal(12, 2);   // price (USD, implied)
    discountPct         : Decimal(7, 4);    // discountPercentage
    rating              : Decimal(4, 2);    // rating
    stock               : Integer;          // stock
    brand               : String(50);       // brand (nullable in some records)
    category            : String(50);       // category

    // ── Import metadata ───────────────────────────────────────────
    importRun           : Association to one ImportRuns;

    // ── Link to local Products catalog ───────────────────────────
    /** code used in local Products: 'REST-{externalID}' */
    localProductCode    : String(40);
    localProduct_ID     : UUID;
}
