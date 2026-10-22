/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/handlers/integration-service.ts
 *  LAYER : Service — IntegrationService CAP Handler
 *
 *  Responsibility
 *  ──────────────
 *  Thin CAP handler that:
 *    1. Wires up the ImportOrchestrator with the production HTTP client
 *    2. Dispatches `on` handlers for the 5 CDS actions/functions
 *    3. Translates ImportResult → CDS ImportSummary return type
 *    4. Implements the marshalOrderToOData / marshalOrderToRest
 *       functions by reading a local SalesOrder and calling the
 *       marshalling functions from marshallers.ts
 *
 *  Dependency injection
 *  ─────────────────────
 *  The handler accepts an optional `httpClient` constructor argument
 *  so that tests can inject a MockHttpClient without patching modules.
 *  In production (when CAP loads the class via require()), the
 *  default AxiosHttpClient is used.
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'

import { AxiosHttpClient }     from '../integration/http-client'
import type { HttpClient }     from '../integration/http-client'
import { NorthwindClient }     from '../integration/northwind-client'
import { RestClient }          from '../integration/rest-client'
import { ImportOrchestrator }  from '../integration/import-orchestrator'
import {
  marshalOrderToOData,
  marshalOrderToRest
}                              from '../integration/marshallers'
import type { LocalOrderForMarshal } from '../integration/marshallers'

const { SELECT } = cds.ql
const LOG = cds.log('IntegrationService')


export default class IntegrationService extends cds.ApplicationService {

  private orchestrator!: ImportOrchestrator


  // ──────────────────────────────────────────────────────────────
  //  Allow test injection of a mock HTTP client
  // ──────────────────────────────────────────────────────────────

  /** Override in tests: IntegrationService.httpClient = mockClient */
  static httpClient: HttpClient | null = null


  // ──────────────────────────────────────────────────────────────
  //  init
  // ──────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await super.init()

    if (!('entities' in this) || !this.entities['ImportRuns']) return  // guard for sibling services

    const http = IntegrationService.httpClient ?? new AxiosHttpClient()
    const db   = await cds.connect.to('db')

    this.orchestrator = new ImportOrchestrator(
      db,
      new NorthwindClient(http),
      new RestClient(http)
    )

    // ── Action handlers ───────────────────────────────────────────
    ;(this as any).on('importFromNorthwind', this.onImportFromNorthwind.bind(this))
    ;(this as any).on('importFromRest',      this.onImportFromRest.bind(this))
    ;(this as any).on('importAll',           this.onImportAll.bind(this))

    // ── Function handlers ─────────────────────────────────────────
    ;(this as any).on('marshalOrderToOData', this.onMarshalOrderToOData.bind(this))
    ;(this as any).on('marshalOrderToRest',  this.onMarshalOrderToRest.bind(this))
  }


  // ──────────────────────────────────────────────────────────────
  //  Action: importFromNorthwind
  // ──────────────────────────────────────────────────────────────

  private async onImportFromNorthwind(req: cds.Request) {
    const maxOrders = (req.data?.maxOrders as number | undefined) ?? 5
    LOG.info(`importFromNorthwind triggered (maxOrders=${maxOrders})`)

    const result = await this.orchestrator.importFromNorthwind(maxOrders)
    return this._toSummary(result)
  }


  // ──────────────────────────────────────────────────────────────
  //  Action: importFromRest
  // ──────────────────────────────────────────────────────────────

  private async onImportFromRest(req: cds.Request) {
    const maxProducts = (req.data?.maxProducts as number | undefined) ?? 10
    LOG.info(`importFromRest triggered (maxProducts=${maxProducts})`)

    const result = await this.orchestrator.importFromRest(maxProducts)
    return this._toSummary(result)
  }


  // ──────────────────────────────────────────────────────────────
  //  Action: importAll
  // ──────────────────────────────────────────────────────────────

  private async onImportAll(req: cds.Request) {
    const maxOrders   = (req.data?.maxOrders   as number | undefined) ?? 5
    const maxProducts = (req.data?.maxProducts as number | undefined) ?? 10
    LOG.info(`importAll triggered (maxOrders=${maxOrders}, maxProducts=${maxProducts})`)

    const [nwResult, restResult] = await Promise.all([
      this.orchestrator.importFromNorthwind(maxOrders),
      this.orchestrator.importFromRest(maxProducts)
    ])

    // Merge both results into a single summary
    return this._toSummary({
      runID:            nwResult.runID,   // primary run ID
      source:           'all',
      status:           nwResult.status === 'failed' || restResult.status === 'failed'
                          ? 'failed' : 'completed',
      ordersImported:   nwResult.ordersImported,
      itemsImported:    nwResult.itemsImported,
      productsImported: nwResult.productsImported + restResult.productsImported,
      durationMs:       Math.max(nwResult.durationMs, restResult.durationMs),
      errorMessage:     [nwResult.errorMessage, restResult.errorMessage]
                          .filter(Boolean).join('; ') || undefined
    })
  }


  // ──────────────────────────────────────────────────────────────
  //  Function: marshalOrderToOData
  // ──────────────────────────────────────────────────────────────

  private async onMarshalOrderToOData(req: cds.Request) {
    const orderID = req.data?.orderID as string | undefined
    if (!orderID) return req.error(400, 'orderID is required')

    const order = await this._readOrderForMarshal(orderID)
    if (!order) return req.error(404, `SalesOrder ${orderID} not found`)

    const payload = marshalOrderToOData(order)
    return {
      orderID,
      format:  'odata',
      payload: JSON.stringify(payload, null, 2)
    }
  }


  // ──────────────────────────────────────────────────────────────
  //  Function: marshalOrderToRest
  // ──────────────────────────────────────────────────────────────

  private async onMarshalOrderToRest(req: cds.Request) {
    const orderID = req.data?.orderID as string | undefined
    if (!orderID) return req.error(400, 'orderID is required')

    const order = await this._readOrderForMarshal(orderID)
    if (!order) return req.error(404, `SalesOrder ${orderID} not found`)

    const payload = marshalOrderToRest(order)
    return {
      orderID,
      format:  'rest',
      payload: JSON.stringify(payload, null, 2)
    }
  }


  // ──────────────────────────────────────────────────────────────
  //  Private helpers
  // ──────────────────────────────────────────────────────────────

  private async _readOrderForMarshal(orderID: string): Promise<LocalOrderForMarshal | null> {
    const db = await cds.connect.to('db')

    const order = await db.run(
      SELECT.one('com.my.sales.SalesOrders')
        .columns('ID', 'salesOrder', 'orderDate', 'netAmount',
                 'transactionCurrency_code', 'overallStatus', 'deliveryStatus')
        .where({ ID: orderID })
    )
    if (!order) return null

    // Expand items with product code
    const items = await db.run(
      SELECT.from('com.my.sales.SalesOrderItems')
        .columns('itemNumber', 'orderQuantity', 'netAmount', 'product_ID')
        .where({ order_ID: orderID, deletionIndicator: ' ' })
    ) as unknown as Array<Record<string, unknown>>

    const enrichedItems = await Promise.all(
      items.map(async (item: Record<string, unknown>) => {
        let product: { code: string } | null = null
        if (item.product_ID) {
          product = await db.run(
            SELECT.one('com.my.sales.Products')
              .columns('code')
              .where({ ID: item.product_ID })
          )
        }
        return { ...item, product }
      })
    )

    return { ...order, items: enrichedItems } as LocalOrderForMarshal
  }

  private _toSummary(result: {
    runID:            string
    source:           string
    status:           string
    ordersImported:   number
    itemsImported:    number
    productsImported: number
    durationMs:       number
    errorMessage?:    string
  }) {
    return {
      runID:            result.runID,
      source:           result.source,
      status:           result.status,
      ordersImported:   result.ordersImported,
      itemsImported:    result.itemsImported,
      productsImported: result.productsImported,
      durationMs:       result.durationMs,
      errorMessage:     result.errorMessage ?? null
    }
  }
}
