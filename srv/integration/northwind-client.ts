/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/integration/northwind-client.ts
 *  LAYER : Integration — Northwind OData v4 Client
 *
 *  Responsibility
 *  ──────────────
 *  Knows how to speak OData v4 to the Northwind public service.
 *  Builds URLs with OData system query options ($top, $expand,
 *  $select, $filter) and unwraps the value[] envelope before
 *  returning data to the caller.
 *
 *  Northwind public service
 *  ─────────────────────────
 *  Base URL: https://services.odata.org/V4/Northwind/Northwind.svc
 *  Auth:     none (public read-only)
 *  Format:   application/json;odata.metadata=minimal  (default)
 *
 *  OData query options used
 *  ─────────────────────────
 *  $top      — limit row count (replaces SQL LIMIT)
 *  $expand   — inline navigation properties (replaces JOIN)
 *  $select   — restrict fields returned (replaces SELECT column list)
 *  $orderby  — deterministic ordering for pagination
 *
 *  The $expand=Order_Details approach avoids N+1 round-trips:
 *  instead of fetching Orders then N×Order_Details requests,
 *  a single request returns both levels.
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'
import type { HttpClient }               from './http-client'
import type {
  ODataCollectionResponse,
  NwOrder,
  NwProduct
} from './types'

const LOG = cds.log('northwind-client')

export const NORTHWIND_BASE =
  'https://services.odata.org/V4/Northwind/Northwind.svc'


export class NorthwindClient {

  constructor(private readonly http: HttpClient) {}


  // ──────────────────────────────────────────────────────────────
  //  fetchOrders — GET /Orders with expanded Order_Details
  // ──────────────────────────────────────────────────────────────

  /**
   * Fetch the first `limit` Orders, each with its Order_Details
   * (line items) expanded inline.
   *
   * OData query constructed:
   *   GET /Orders
   *     ?$top=5
   *     &$expand=Order_Details
   *     &$select=OrderID,CustomerID,EmployeeID,OrderDate,RequiredDate,
   *              ShippedDate,Freight,ShipName,ShipAddress,ShipCity,
   *              ShipRegion,ShipPostalCode,ShipCountry
   *     &$orderby=OrderID asc
   *
   * Response envelope (OData v4 minimal metadata):
   * {
   *   "@odata.context": "…/$metadata#Orders",
   *   "value": [
   *     {
   *       "OrderID": 10248,
   *       "OrderDate": "1996-07-04T00:00:00Z",
   *       "Freight": 32.38,
   *       "Order_Details": [
   *         { "OrderID": 10248, "ProductID": 11,
   *           "UnitPrice": 14.0, "Quantity": 12, "Discount": 0 }
   *       ]
   *     }
   *   ]
   * }
   *
   * Unmarshalling note: the @odata.context annotation is stripped;
   * only the typed value[] is returned.  Callers work with strongly-
   * typed NwOrder[] without dealing with the OData envelope.
   */
  async fetchOrders(limit = 5): Promise<NwOrder[]> {
    const clampedLimit = Math.min(Math.max(1, limit), 20)

    const selectFields = [
      'OrderID', 'CustomerID', 'EmployeeID',
      'OrderDate', 'RequiredDate', 'ShippedDate',
      'Freight', 'ShipName', 'ShipAddress', 'ShipCity',
      'ShipRegion', 'ShipPostalCode', 'ShipCountry'
    ].join(',')

    const url =
      `${NORTHWIND_BASE}/Orders` +
      `?$top=${clampedLimit}` +
      `&$expand=Order_Details` +
      `&$select=${selectFields}` +
      `&$orderby=OrderID%20asc`

    LOG.info(`Fetching ${clampedLimit} Northwind orders via OData v4`)
    LOG.debug(`OData URL: ${url}`)

    const resp = await this.http.get<ODataCollectionResponse<NwOrder>>(url, {
      // Request OData v4 minimal metadata — includes @odata.context
      // but omits per-property type annotations (reduces payload size)
      Accept: 'application/json;odata.metadata=minimal'
    })

    // ── Unmarshal: strip OData envelope, return typed array ────────
    // The @odata.context annotation tells us the entity set we queried
    // but we already know that — discard it and work with value[].
    const orders = resp.data.value
    LOG.info(`Northwind: received ${orders.length} orders (with details)`)
    return orders
  }


  // ──────────────────────────────────────────────────────────────
  //  fetchProducts — GET /Products
  // ──────────────────────────────────────────────────────────────

  /**
   * Fetch up to `limit` Products from the Northwind catalog.
   *
   * OData query constructed:
   *   GET /Products
   *     ?$top=N
   *     &$select=ProductID,ProductName,SupplierID,CategoryID,
   *              QuantityPerUnit,UnitPrice,UnitsInStock,
   *              UnitsOnOrder,Discontinued
   *     &$orderby=ProductID asc
   *
   * Products are fetched separately from orders so that the product
   * catalog can be seeded independently (e.g. at application startup)
   * without triggering a full order import.
   */
  async fetchProducts(limit = 20): Promise<NwProduct[]> {
    const clampedLimit = Math.min(Math.max(1, limit), 77) // Northwind has 77 products

    const selectFields = [
      'ProductID', 'ProductName', 'SupplierID', 'CategoryID',
      'QuantityPerUnit', 'UnitPrice', 'UnitsInStock',
      'UnitsOnOrder', 'Discontinued'
    ].join(',')

    const url =
      `${NORTHWIND_BASE}/Products` +
      `?$top=${clampedLimit}` +
      `&$select=${selectFields}` +
      `&$orderby=ProductID%20asc`

    LOG.debug(`OData URL: ${url}`)

    const resp = await this.http.get<ODataCollectionResponse<NwProduct>>(url, {
      Accept: 'application/json;odata.metadata=minimal'
    })

    const products = resp.data.value
    LOG.info(`Northwind: received ${products.length} products`)
    return products
  }
}
