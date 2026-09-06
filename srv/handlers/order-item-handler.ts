/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/handlers/order-item-handler.ts
 *  LAYER : Service — SalesOrderItems Handlers
 *
 *  Responsibility (Single Responsibility Principle)
 *  ─────────────────────────────────────────────────
 *  Handles all events scoped to SalesOrderItems:
 *    • Invariant #1 — keep header.netAmount = Σ item.netAmount
 *                     (after CREATE/UPDATE/DELETE on items)
 *    • Action       — addToDelivery (item-level WM integration)
 *
 *  The order_ID capture trick
 *  ───────────────────────────
 *  After a DELETE on SalesOrderItems, CAP only passes the PK of the
 *  deleted row — not the full entity.  The before-DELETE handler
 *  reads and stores order_ID on req.data so the after-DELETE handler
 *  can sync the header without querying a row that no longer exists.
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'

import { EVENT_TYPES }          from '../lib/events'
import type { EventPublisher }  from '../lib/events'
import type {
  SalesOrderItem,
  AddToDeliveryData
} from '../types/domain'

const { SELECT, UPDATE } = cds.ql
const LOG = cds.log('OrderItemHandler')


export class OrderItemHandler {

  constructor(
    private readonly svc:       cds.ApplicationService,
    private readonly entities:  Record<string, any>,
    private readonly publisher: EventPublisher
  ) {}


  // ──────────────────────────────────────────────────────────────
  //  register() — attach all item-scoped hooks to the service
  // ──────────────────────────────────────────────────────────────

  register(): void {
    const { SalesOrderItems } = this.entities

    // Invariant #1: sync header netAmount whenever items change
    this.svc.after(['CREATE', 'UPDATE'], SalesOrderItems,
      this.recomputeHeaderNetAmountAfterItemChange.bind(this))

    this.svc.before('DELETE', SalesOrderItems,
      this.captureItemOrderID.bind(this))

    this.svc.after('DELETE', SalesOrderItems,
      this.recomputeHeaderNetAmountAfterItemDelete.bind(this))

    // Item-level domain action
    this.svc.on('addToDelivery', SalesOrderItems,
      this.onAddToDelivery.bind(this))
  }


  // ──────────────────────────────────────────────────────────────
  //  Invariant #1 — after CREATE / UPDATE on items
  // ──────────────────────────────────────────────────────────────

  private async recomputeHeaderNetAmountAfterItemChange(
    results: SalesOrderItem | SalesOrderItem[],
    _req:    cds.Request
  ): Promise<void> {
    const items    = Array.isArray(results) ? results : [results]
    const orderIDs = [...new Set(
      items.map(i => i.order_ID).filter(Boolean)
    )] as string[]

    await Promise.all(orderIDs.map(id => this._syncHeaderNetAmount(id)))
  }


  // ──────────────────────────────────────────────────────────────
  //  Capture order_ID before item DELETE (used by after-DELETE)
  // ──────────────────────────────────────────────────────────────

  private async captureItemOrderID(req: cds.Request): Promise<void> {
    const key = req.params?.[0] as { ID?: string } | undefined
    if (!key?.ID) return

    const { SalesOrderItems } = this.entities
    const item = await SELECT.one
      .from(SalesOrderItems)
      .columns('order_ID')
      .where({ ID: key.ID })

    if (item?.order_ID) {
      Object.assign(req.data, { order_ID: item.order_ID })
    }
  }


  // ──────────────────────────────────────────────────────────────
  //  Invariant #1 — after DELETE on items
  // ──────────────────────────────────────────────────────────────

  private async recomputeHeaderNetAmountAfterItemDelete(
    _results: unknown,
    req:      cds.Request
  ): Promise<void> {
    const orderID = (req.data as { order_ID?: string })?.order_ID
    if (!orderID) {
      LOG.warn(
        'recomputeHeaderNetAmountAfterItemDelete: order_ID was not captured ' +
        'before the DELETE — header netAmount not updated.'
      )
      return
    }
    await this._syncHeaderNetAmount(orderID)
  }


  // ──────────────────────────────────────────────────────────────
  //  Action: addToDelivery
  // ──────────────────────────────────────────────────────────────

  async onAddToDelivery(req: cds.Request): Promise<SalesOrderItem | void> {
    const key               = req.params[0] as { ID: string }
    const { deliveryBlock } = (req.data ?? {}) as AddToDeliveryData
    const { SalesOrderItems } = this.entities

    const item = await SELECT.one
      .from(SalesOrderItems)
      .columns('ID', 'itemNumber', 'order_ID', 'deletionIndicator')
      .where({ ID: key.ID })

    if (!item)
      return req.reject(404, `Order item ${key.ID} not found.`)
    if (item.deletionIndicator === 'X')
      return req.reject(422,
        `Item ${item.itemNumber} is logically deleted and cannot be added to delivery.`)

    await this.publisher.publish(
      EVENT_TYPES.ITEM_DELIVERY,
      {
        itemID:       item.ID        as string,
        orderID:      item.order_ID  as string,
        itemNumber:   item.itemNumber as number,
        deliveryBlock
      },
      item.order_ID as string
    )

    LOG.info(
      `Item ${item.itemNumber} of order ${item.order_ID} ` +
      `${deliveryBlock ? 'blocked from' : 'released for'} delivery.`
    )

    return await SELECT.one.from(SalesOrderItems).where({ ID: key.ID }) as SalesOrderItem
  }


  // ──────────────────────────────────────────────────────────────
  //  Private helper: recompute header.netAmount from active items
  // ──────────────────────────────────────────────────────────────

  private async _syncHeaderNetAmount(orderID: string): Promise<void> {
    const { SalesOrders, SalesOrderItems } = this.entities

    const rows = await SELECT
      .from(SalesOrderItems)
      .columns('netAmount')
      .where({ order_ID: orderID, deletionIndicator: ' ' })

    const total = rows.reduce(
      (sum: number, r: { netAmount?: number }) => sum + (r.netAmount ?? 0),
      0
    )

    await UPDATE.entity(SalesOrders)
      .set({ netAmount: total })
      .where({ ID: orderID })

    LOG.debug(`Synced header netAmount for order ${orderID}: ${total}`)
  }
}
