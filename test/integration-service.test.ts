/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : test/integration-service.test.ts
 *  LAYER : Tests — IntegrationService
 *
 *  Test strategy
 *  ─────────────
 *  UNIT tests (no CAP runtime, no HTTP):
 *    ✓ unmarshalNwOrder       — OData → shadow + local types
 *    ✓ unmarshalNwOrderDetail — lineTotal computation
 *    ✓ unmarshalNwProduct     — product code + field mapping
 *    ✓ unmarshalRestProduct   — REST → shadow (camelCase → local)
 *    ✓ marshalOrderToOData    — local → OData envelope
 *    ✓ marshalOrderToRest     — local → flat REST/JSON
 *    ✓ MockHttpClient         — pattern matching + error
 *
 *  INTEGRATION tests (full CAP stack, MockHttpClient):
 *    ✓ importFromNorthwind    — OData full cycle end-to-end
 *    ✓ importFromRest         — REST full cycle end-to-end
 *    ✓ marshalOrderToOData    — function endpoint via HTTP
 *    ✓ marshalOrderToRest     — function endpoint via HTTP
 *    ✓ ImportRuns audit log   — records created for each import
 *    ✓ Shadow entities        — NorthwindOrders populated
 *    ✓ Local domain           — SalesOrders + Products upserted
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'

// ── Wire mock HTTP client BEFORE cds.test() boots the server ──────
// cds.test() schedules a beforeAll that calls IntegrationService.init().
// The static httpClient must be set synchronously here so init() picks
// up the mock instead of creating a real AxiosHttpClient.

const { MockHttpClient } = require('../srv/integration/http-client') as
  typeof import('../srv/integration/http-client')
const IntegrationService = require('../srv/handlers/integration-service').default as
  typeof import('../srv/handlers/integration-service').default

const _mockOrders = {
  '@odata.context': 'https://services.odata.org/V4/Northwind/Northwind.svc/$metadata#Orders',
  value: [
    {
      OrderID: 99901, CustomerID: 'ALFKI', EmployeeID: 1,
      OrderDate: '1996-07-04T00:00:00Z',
      RequiredDate: '1996-08-01T00:00:00Z',
      ShippedDate: null,
      Freight: 50.00,
      ShipName: 'Test Ship', ShipAddress: '123 Test St',
      ShipCity: 'Berlin', ShipRegion: null,
      ShipPostalCode: '12345', ShipCountry: 'Germany',
      Order_Details: [
        { OrderID: 99901, ProductID: 1, UnitPrice: 18.0, Quantity: 5, Discount: 0 }
      ]
    }
  ]
}

const _mockProducts = {
  '@odata.context': 'https://services.odata.org/V4/Northwind/Northwind.svc/$metadata#Products',
  value: [
    {
      ProductID: 1, ProductName: 'Chai', SupplierID: 1, CategoryID: 1,
      QuantityPerUnit: '10 boxes', UnitPrice: 18.0,
      UnitsInStock: 39, UnitsOnOrder: 0,
      ReorderLevel: 10, Discontinued: false
    }
  ]
}

const _mockRestProducts = {
  products: [
    {
      id: 1, title: 'iPhone 9',
      description: 'A test phone', price: 549.99,
      discountPercentage: 12.96, rating: 4.69,
      stock: 94, brand: 'Apple', category: 'smartphones',
      thumbnail: 'https://cdn.dummyjson.com/1/thumb.jpg', images: []
    }
  ],
  total: 1, skip: 0, limit: 10
}

const _testHttpMock = new MockHttpClient()
_testHttpMock.register('/Orders',              _mockOrders)
_testHttpMock.register('/Products',            _mockProducts)
_testHttpMock.register('dummyjson.com/products', _mockRestProducts)
IntegrationService.httpClient = _testHttpMock   // set before cds.test()

// ── CAP test setup ────────────────────────────────────────────────
const { POST, GET } = cds.test(__dirname + '/..')

afterAll(() => { IntegrationService.httpClient = null })

const AS_BOB     = { auth: { username: 'bob',     password: '' } }  // SalesManager
const AS_CHARLIE = { auth: { username: 'charlie', password: '' } }  // SalesAuditor

// const { INSERT } = cds.ql  // reserved for future use


// ══════════════════════════════════════════════════════════════════
//  Marshallers — pure unit tests (no I/O)
// ══════════════════════════════════════════════════════════════════

describe('Marshallers (unit — no HTTP, no DB)', () => {

  const {
    unmarshalNwOrder,
    unmarshalNwOrderDetail,
    unmarshalNwProduct,
    unmarshalRestProduct,
    marshalOrderToOData,
    marshalOrderToRest,
    USD_EUR_RATE
  } = require('../srv/integration/marshallers') as
    typeof import('../srv/integration/marshallers')


  // ── A) OData unmarshal ────────────────────────────────────────

  describe('unmarshalNwOrderDetail', () => {
    test('computes lineTotal: qty × unitPrice × (1 − discount)', () => {
      const detail = { OrderID: 10248, ProductID: 11,
                       UnitPrice: 14.0, Quantity: 12, Discount: 0 }
      const result = unmarshalNwOrderDetail(detail)
      // 12 × 14.0 × (1 - 0) = 168.0
      expect(result.lineTotal).toBeCloseTo(168.0, 4)
    })

    test('applies discount correctly', () => {
      const detail = { OrderID: 10248, ProductID: 42,
                       UnitPrice: 9.8, Quantity: 10, Discount: 0.15 }
      // 10 × 9.8 × (1 - 0.15) = 83.3
      expect(unmarshalNwOrderDetail(detail).lineTotal).toBeCloseTo(83.3, 2)
    })

    test('stores raw fields unchanged', () => {
      const detail = { OrderID: 10248, ProductID: 11,
                       UnitPrice: 14.0, Quantity: 12, Discount: 0.05 }
      const result = unmarshalNwOrderDetail(detail)
      expect(result.northwindOrderID).toBe(10248)
      expect(result.northwindProductID).toBe(11)
      expect(result.unitPrice).toBe(14.0)
      expect(result.quantity).toBe(12)
      expect(result.discount).toBe(0.05)
    })
  })

  describe('unmarshalNwOrder', () => {
    const rawOrder = {
      OrderID: 10248,
      CustomerID: 'VINET',
      EmployeeID: 5,
      OrderDate:    '1996-07-04T00:00:00Z',
      RequiredDate: '1996-08-01T00:00:00Z',
      ShippedDate:  '1996-07-16T00:00:00Z',
      Freight: 32.38,
      ShipName: 'Vins et alcools Chevalier',
      ShipAddress: '59 rue de l\'Abbaye',
      ShipCity: 'Reims',
      ShipRegion: null,
      ShipPostalCode: '51100',
      ShipCountry: 'France',
      Order_Details: [
        { OrderID: 10248, ProductID: 11, UnitPrice: 14.0, Quantity: 12, Discount: 0 },
        { OrderID: 10248, ProductID: 42, UnitPrice: 9.8,  Quantity: 10, Discount: 0 }
      ]
    }

    test('strips time part from DateTimeOffset dates', () => {
      const { shadow } = unmarshalNwOrder(rawOrder)
      expect(shadow.orderDate).toBe('1996-07-04')
      expect(shadow.requiredDate).toBe('1996-08-01')
      expect(shadow.shippedDate).toBe('1996-07-16')
    })

    test('applies USD→EUR conversion on freight', () => {
      const { shadow } = unmarshalNwOrder(rawOrder)
      const expected = Math.round(32.38 * USD_EUR_RATE * 10000) / 10000
      expect(shadow.freightConverted).toBeCloseTo(expected, 4)
      expect(shadow.convertedCurrency).toBe('EUR')
      expect(shadow.conversionRate).toBe(USD_EUR_RATE)
    })

    test('generates correct sales order number (NW-{ID}, max 10 chars)', () => {
      const { localOrder } = unmarshalNwOrder(rawOrder)
      expect(localOrder.salesOrder).toBe('NW-10248')
      expect(localOrder.salesOrder.length).toBeLessThanOrEqual(10)
    })

    test('produces one item shadow per Order_Detail', () => {
      const { itemShadows } = unmarshalNwOrder(rawOrder)
      expect(itemShadows).toHaveLength(2)
    })

    test('produces one local item candidate per Order_Detail', () => {
      const { localItems } = unmarshalNwOrder(rawOrder)
      expect(localItems).toHaveLength(2)
      // Product codes: 'NW-0011', 'NW-0042'
      expect(localItems.find(i => i.productCode === 'NW-0011')).toBeDefined()
      expect(localItems.find(i => i.productCode === 'NW-0042')).toBeDefined()
    })

    test('handles null ShipRegion without crashing', () => {
      const { shadow } = unmarshalNwOrder(rawOrder)
      expect(shadow.shipRegion).toBeNull()
    })
  })

  describe('unmarshalNwProduct', () => {
    test('generates NW-{padded} product code', () => {
      const raw = { ProductID: 11, ProductName: 'Queso Cabrales',
                    SupplierID: 5, CategoryID: 4, QuantityPerUnit: '1 kg pkg.',
                    UnitPrice: 21.0, UnitsInStock: 22, UnitsOnOrder: 30,
                    ReorderLevel: 30, Discontinued: false }
      const { localCode } = unmarshalNwProduct(raw)
      expect(localCode).toBe('NW-0011')
    })

    test('maps Discontinued boolean correctly', () => {
      const raw = { ProductID: 5, ProductName: 'Chef Anton\'s Gumbo Mix',
                    SupplierID: 2, CategoryID: 2, QuantityPerUnit: '36 boxes',
                    UnitPrice: 21.35, UnitsInStock: 0, UnitsOnOrder: 0,
                    ReorderLevel: 0, Discontinued: true }
      const { shadow } = unmarshalNwProduct(raw)
      expect(shadow.discontinued).toBe(true)
    })
  })


  // ── B) REST unmarshal ─────────────────────────────────────────

  describe('unmarshalRestProduct', () => {
    const rawRest = {
      id: 1, title: 'iPhone 9',
      description: 'An apple mobile which is nothing like apple',
      price: 549.99, discountPercentage: 12.96,
      rating: 4.69, stock: 94,
      brand: 'Apple', category: 'smartphones',
      thumbnail: 'https://cdn.dummyjson.com/product-images/1/thumbnail.jpg',
      images: []
    }

    test('maps id → externalID', () => {
      expect(unmarshalRestProduct(rawRest).shadow.externalID).toBe(1)
    })

    test('maps title to shadow.title (not productName — REST convention)', () => {
      expect(unmarshalRestProduct(rawRest).shadow.title).toBe('iPhone 9')
    })

    test('generates REST-{id} product code', () => {
      expect(unmarshalRestProduct(rawRest).localCode).toBe('REST-1')
    })

    test('stores discountPercentage as-is in discountPct', () => {
      expect(unmarshalRestProduct(rawRest).shadow.discountPct).toBeCloseTo(12.96, 2)
    })

    test('converts undefined brand to null', () => {
      const nosBrand = { ...rawRest, brand: undefined }
      expect(unmarshalRestProduct(nosBrand).shadow.brand).toBeNull()
    })

    test('structural contrast: REST has no @odata.context key', () => {
      // The raw REST product has no OData annotations
      expect((rawRest as any)['@odata.context']).toBeUndefined()
      expect((rawRest as any)['@odata.type']).toBeUndefined()
    })
  })


  // ── C) OData marshal ─────────────────────────────────────────

  describe('marshalOrderToOData', () => {
    const localOrder = {
      ID:                       'abc-123',
      salesOrder:               'TEST-001',
      orderDate:                '2025-01-15',
      netAmount:                500.00,
      transactionCurrency_code: 'USD',
      overallStatus:            'A',
      deliveryStatus:           'A',
      items: [
        { itemNumber: 10, orderQuantity: 5, netAmount: 250,
          product: { code: 'MAT-01' } }
      ]
    }

    test('adds @odata.context annotation', () => {
      const payload = marshalOrderToOData(localOrder)
      expect(payload['@odata.context']).toContain('$metadata')
    })

    test('adds @odata.type annotation', () => {
      const payload = marshalOrderToOData(localOrder)
      expect(payload['@odata.type']).toContain('SalesOrders')
    })

    test('converts camelCase CDS → PascalCase OData field names', () => {
      const payload = marshalOrderToOData(localOrder)
      expect(payload.SalesOrder).toBe('TEST-001')   // PascalCase
      expect(payload.OrderDate).toBe('2025-01-15T00:00:00Z')  // DateTimeOffset
      expect(payload.NetAmount).toBe(500.00)
      expect(payload.Currency).toBe('USD')
    })

    test('converts Date string to DateTimeOffset format', () => {
      const payload = marshalOrderToOData(localOrder)
      expect(payload.OrderDate).toMatch(/T00:00:00Z$/)
    })

    test('includes items with @odata.type per item', () => {
      const payload = marshalOrderToOData(localOrder)
      expect(payload.Items).toHaveLength(1)
      expect(payload.Items[0]['@odata.type']).toContain('SalesOrderItems')
      expect(payload.Items[0].ItemNumber).toBe(10)
      expect(payload.Items[0].ProductCode).toBe('MAT-01')
    })
  })


  // ── D) REST marshal ───────────────────────────────────────────

  describe('marshalOrderToRest', () => {
    const localOrder = {
      ID:                       'abc-123',
      salesOrder:               'TEST-001',
      orderDate:                '2025-01-15',
      netAmount:                500.00,
      transactionCurrency_code: 'EUR',
      overallStatus:            'B',
      deliveryStatus:           'A',
      items: [
        { itemNumber: 10, orderQuantity: 2, netAmount: 100,
          product: { code: 'MAT-01' } }
      ]
    }

    test('has NO @odata.context annotation', () => {
      const payload = marshalOrderToRest(localOrder)
      expect((payload as any)['@odata.context']).toBeUndefined()
    })

    test('has NO @odata.type annotation', () => {
      const payload = marshalOrderToRest(localOrder)
      expect((payload as any)['@odata.type']).toBeUndefined()
    })

    test('uses camelCase field names (REST convention)', () => {
      const payload = marshalOrderToRest(localOrder)
      expect(payload.salesOrder).toBe('TEST-001')   // camelCase
      expect(payload.orderDate).toBe('2025-01-15')  // no DateTimeOffset
      expect(payload.netAmount).toBe(500.00)
      expect(payload.currency).toBe('EUR')
    })

    test('uses UUID as id (not OrderID PascalCase)', () => {
      const payload = marshalOrderToRest(localOrder)
      expect(payload.id).toBe('abc-123')
      expect((payload as any).OrderID).toBeUndefined()
    })

    test('includes items with camelCase field names', () => {
      const payload = marshalOrderToRest(localOrder)
      expect(payload.items).toHaveLength(1)
      expect(payload.items[0].itemNumber).toBe(10)     // camelCase
      expect(payload.items[0].productCode).toBe('MAT-01')
    })
  })


  // ── MockHttpClient ────────────────────────────────────────────

  describe('MockHttpClient', () => {
    const { MockHttpClient, HttpError } = require('../srv/integration/http-client') as
      typeof import('../srv/integration/http-client')

    test('returns registered payload for matching URL', async () => {
      const mock = new MockHttpClient()
      mock.register('/Orders', { '@odata.context': '…', value: [{ OrderID: 1 }] })
      const resp = await mock.get('https://example.com/Orders?$top=5')
      expect((resp.data as any).value[0].OrderID).toBe(1)
    })

    test('throws HttpError for unregistered URL', async () => {
      const mock = new MockHttpClient()
      await expect(mock.get('https://unknown.com/data'))
        .rejects.toBeInstanceOf(HttpError)
    })

    test('HttpError carries status and URL', async () => {
      const mock = new MockHttpClient()
      try {
        await mock.get('https://nowhere.com/x')
      } catch (err: any) {
        expect(err.status).toBe(404)
        expect(err.url).toBe('https://nowhere.com/x')
      }
    })
  })
})


// ══════════════════════════════════════════════════════════════════
//  IntegrationService — HTTP API integration tests
// ══════════════════════════════════════════════════════════════════

describe('IntegrationService — HTTP API', () => {


  // ── importFromNorthwind ───────────────────────────────────────

  describe('POST /api/integration/importFromNorthwind', () => {

    test('SalesManager can trigger import and receives ImportSummary', async () => {
      const { status, data } = await POST(
        '/api/integration/IntegrationService.importFromNorthwind',
        { maxOrders: 1 },
        AS_BOB
      )
      expect(status).toBe(200)
      expect(data.status).toBe('completed')
      expect(data.ordersImported).toBe(1)
      expect(data.itemsImported).toBe(1)
      expect(data.productsImported).toBeGreaterThanOrEqual(1)
      expect(data.runID).toBeTruthy()
    })

    test('SalesAuditor is forbidden from triggering import', async () => {
      await expect(
        POST('/api/integration/IntegrationService.importFromNorthwind', {}, AS_CHARLIE)
      ).rejects.toMatchObject({ response: { status: 403 } })
    })
  })


  // ── importFromRest ────────────────────────────────────────────

  describe('POST /api/integration/importFromRest', () => {

    test('SalesManager can import REST products', async () => {
      const { status, data } = await POST(
        '/api/integration/IntegrationService.importFromRest',
        { maxProducts: 1 },
        AS_BOB
      )
      expect(status).toBe(200)
      expect(data.status).toBe('completed')
      expect(data.productsImported).toBe(1)
    })
  })


  // ── Shadow entities populated ─────────────────────────────────

  describe('GET /api/integration/ImportRuns', () => {

    test('audit records are created for each import', async () => {
      const { status, data } = await GET('/api/integration/ImportRuns', AS_BOB)
      expect(status).toBe(200)
      // At least 2 runs: one Northwind + one REST
      expect(data.value.length).toBeGreaterThanOrEqual(2)
    })

    test('SalesAuditor can read ImportRuns', async () => {
      const { status } = await GET('/api/integration/ImportRuns', AS_CHARLIE)
      expect(status).toBe(200)
    })
  })

  describe('GET /api/integration/NorthwindOrders', () => {

    test('shadow orders are stored after import', async () => {
      const { status, data } = await GET('/api/integration/NorthwindOrders', AS_BOB)
      expect(status).toBe(200)
      // At least the order from our mock
      const order = data.value.find((o: any) => o.northwindOrderID === 99901)
      expect(order).toBeDefined()
      expect(order.shipCountry).toBe('Germany')
      // freightConverted may come back as string from SQLite — coerce to number
      const freight = typeof order.freightConverted === 'string'
        ? parseFloat(order.freightConverted)
        : (order.freightConverted as number)
      expect(freight).toBeCloseTo(50.00 * 0.92, 2)
    })
  })


  // ── Local domain populated ────────────────────────────────────

  describe('Local SalesOrders after import', () => {

    test('local SalesOrder NW-99901 is upserted', async () => {
      const { data } = await GET(
        `/api/integration/LocalOrders?$filter=salesOrder eq 'NW-99901'`,
        AS_BOB
      )
      expect(data.value).toHaveLength(1)
      expect(data.value[0].salesOrder).toBe('NW-99901')
    })
  })


  // ── Marshal functions ─────────────────────────────────────────

  describe('GET /api/integration/marshalOrderToOData', () => {

    test('returns OData-formatted payload for a valid order', async () => {
      // Get the NW-99901 order ID first
      const { data: orders } = await GET(
        `/api/integration/LocalOrders?$filter=salesOrder eq 'NW-99901'`,
        AS_BOB
      )
      const orderID = orders.value[0].ID

      const { status, data } = await GET(
        `/api/integration/marshalOrderToOData(orderID=${orderID})`,
        AS_BOB
      )
      expect(status).toBe(200)
      expect(data.format).toBe('odata')

      // Parse the payload and verify OData annotations
      const payload = JSON.parse(data.payload)
      expect(payload['@odata.context']).toBeDefined()
      expect(payload['@odata.type']).toBeDefined()
      expect(payload.SalesOrder).toBe('NW-99901')   // PascalCase
      // orderDate should be DateTimeOffset
      expect(payload.OrderDate).toMatch(/T00:00:00Z$/)
    })
  })

  describe('GET /api/integration/marshalOrderToRest', () => {

    test('returns flat REST/JSON payload without OData envelope', async () => {
      const { data: orders } = await GET(
        `/api/integration/LocalOrders?$filter=salesOrder eq 'NW-99901'`,
        AS_BOB
      )
      const orderID = orders.value[0].ID

      const { status, data } = await GET(
        `/api/integration/marshalOrderToRest(orderID=${orderID})`,
        AS_BOB
      )
      expect(status).toBe(200)
      expect(data.format).toBe('rest')

      const payload = JSON.parse(data.payload)
      // No OData annotations
      expect(payload['@odata.context']).toBeUndefined()
      expect(payload['@odata.type']).toBeUndefined()
      // camelCase field names
      expect(payload.salesOrder).toBe('NW-99901')
      expect(payload.id).toBe(orderID)
    })
  })
})
