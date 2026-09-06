/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/integration/rest-client.ts
 *  LAYER : Integration — DummyJSON REST Client
 *
 *  Responsibility
 *  ──────────────
 *  Knows how to consume the dummyjson.com Products REST API and
 *  returns typed DummyJsonProduct[] to the caller.
 *
 *  Why dummyjson?
 *  ──────────────
 *  • Publicly accessible without auth — works on BTP Trial
 *  • Returns realistic product data with varied field types
 *  • Demonstrates REST/JSON structural contrast vs OData:
 *
 *  REST response structure        OData response structure
 *  ─────────────────────────      ────────────────────────────────
 *  {                              {
 *    "products": [ ... ],           "@odata.context": "…",
 *    "total": 194,                  "value": [ ... ]
 *    "skip":  0,                  }
 *    "limit": 10
 *  }
 *
 *  Key structural differences
 *  ───────────────────────────
 *  1. No @odata.context — the schema is implicit (must be known ahead)
 *  2. Named array key ("products") vs generic "value" in OData
 *  3. Pagination via integer offsets (skip/limit) vs OData $skiptoken
 *  4. camelCase vs PascalCase field names
 *  5. No type annotations per-field (no @odata.type metadata)
 *  6. Flat structure — no navigation properties or $expand concept
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'
import type { HttpClient }                    from './http-client'
import type { DummyJsonProductsResponse, DummyJsonProduct } from './types'

const LOG = cds.log('rest-client')

export const DUMMY_JSON_BASE = 'https://dummyjson.com'


export class RestClient {

  constructor(private readonly http: HttpClient) {}


  // ──────────────────────────────────────────────────────────────
  //  fetchProducts — GET /products?limit=N&skip=0
  // ──────────────────────────────────────────────────────────────

  /**
   * Fetch up to `limit` products from dummyjson.com.
   *
   * REST URL constructed:
   *   GET https://dummyjson.com/products?limit=10&skip=0
   *
   * Response structure (flat JSON, no OData envelope):
   * {
   *   "products": [
   *     {
   *       "id": 1,
   *       "title": "iPhone 9",
   *       "description": "An apple mobile...",
   *       "price": 549.99,
   *       "discountPercentage": 12.96,
   *       "rating": 4.69,
   *       "stock": 94,
   *       "brand": "Apple",
   *       "category": "smartphones",
   *       "thumbnail": "https://…",
   *       "images": ["https://…"]
   *     }
   *   ],
   *   "total": 194,
   *   "skip": 0,
   *   "limit": 10
   * }
   *
   * Unmarshalling note:
   *   The "products" key is the discriminator — not a generic "value"
   *   array. This means the unmarshaller must know in advance which
   *   key holds the data (i.e., the schema cannot be discovered from
   *   the response metadata alone, unlike OData $metadata).
   */
  async fetchProducts(limit = 10): Promise<DummyJsonProduct[]> {
    const clampedLimit = Math.min(Math.max(1, limit), 100)
    const url = `${DUMMY_JSON_BASE}/products?limit=${clampedLimit}&skip=0`

    LOG.info(`Fetching ${clampedLimit} products via REST/JSON`)
    LOG.debug(`REST URL: ${url}`)

    const resp = await this.http.get<DummyJsonProductsResponse>(url)

    // ── Unmarshal: extract the named array (no generic "value") ───
    // REST response uses a domain-specific key ("products") instead
    // of the OData convention of always using "value".
    const products = resp.data.products ?? []
    LOG.info(`REST: received ${products.length} products`)
    return products
  }
}
