/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/lib/validations.ts
 *  LAYER : Service — Domain Invariant Validation
 *
 *  Implements the validation rules enumerated in ARCHITECTURE.md:
 *
 *  | # | Invariant                                 | Enforced here |
 *  |---|-------------------------------------------|---------------|
 *  | 1 | netAmount = Σ item netAmounts             | after-handler |
 *  | 2 | submitOrder: ≥1 schedule line per item    | onSubmitOrder |
 *  | 3 | statuses are computed — never patched     | @readonly CDS |
 *  | 4 | deleted orders reject all writes          | guardDeleted  |
 *  | 5 | soldToParty must exist and not be blocked | here          |
 *
 *  Design: the validator receives the entity registry from the service
 *  so that it can issue CQL queries without knowing about the service
 *  context.  This keeps it independently testable.
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'
import type { SalesOrder, SalesOrderPartner } from '../types/domain'

const { SELECT } = cds.ql


export class SalesOrderValidator {

  /**
   * @param entities  Entity registry from `service.entities` — provides
   *                  the entity definitions required for CQL queries.
   */
  constructor(private readonly entities: Record<string, object>) {}


  // ── Invariant #5: sold-to partner ──────────────────────────────

  /**
   * Validate a new sales order before it is persisted.
   * Called from the `before CREATE` handler on SalesOrders.
   *
   * Checks performed:
   *   a) Requested delivery date must not precede the order date.
   *   b) If a sold-to partner (role AG) is supplied inline (deep insert),
   *      the referenced business partner must not be blocked.
   */
  async validateNewOrder(
    data:     Partial<SalesOrder>,
    req:      cds.Request
  ): Promise<void> {

    // (a) Date consistency
    if (data.orderDate && data.requestedDelivDate) {
      const orderDate = new Date(data.orderDate)
      const delivDate = new Date(data.requestedDelivDate)
      if (delivDate < orderDate) {
        // req.reject() throws — subsequent code in the handler does not run
        req.reject(422,
          'Requested delivery date cannot be earlier than the order date.')
      }
    }

    // (b) Sold-to partner (optional on create, mandatory on submit)
    if (Array.isArray(data.partners)) {
      const soldTo = data.partners.find(
        (p: Partial<SalesOrderPartner>) => p.role === 'AG'
      )
      if (soldTo?.partner_ID) {
        await this.assertPartnerNotBlocked(soldTo.partner_ID, req)
      }
    }
  }

  /**
   * Assert that the business partner identified by `partnerID` is not blocked.
   * Rejects the request with HTTP 422 if the partner's `blocked` flag is true.
   *
   * Also used in `onSubmitOrder` to re-validate the sold-to partner
   * at submission time — in case the block was set after order creation.
   */
  async assertPartnerNotBlocked(
    partnerID: string,
    req:       cds.Request
  ): Promise<void> {
    const { BusinessPartners } = this.entities as any

    const bp = await SELECT.one
      .from(BusinessPartners)
      .columns('blocked', 'name', 'code')
      .where({ ID: partnerID })

    if (bp?.blocked) {
      req.reject(422,
        `Business partner ${bp.code} (${bp.name}) is blocked. ` +
        `Release the delivery or order block before using this partner.`)
    }
  }

  /**
   * Validate that every active item on an order has at least one
   * SalesOrderScheduleLine before the order can be submitted.
   *
   * Uses two queries instead of N+1:
   *   1. Fetch all active item IDs + numbers for the order.
   *   2. Fetch all schedule line item_IDs for those items in one IN query.
   * Items absent from the second result set are missing schedule lines.
   *
   * @returns Array of item numbers that are missing schedule lines.
   *          Empty array = all items are valid.
   */
  async findItemsMissingScheduleLines(
    orderID: string
  ): Promise<number[]> {
    const { SalesOrderItems, SalesOrderScheduleLines } = this.entities as any

    const items = await SELECT
      .from(SalesOrderItems)
      .columns('ID', 'itemNumber')
      .where({ order_ID: orderID, deletionIndicator: ' ' })

    if (items.length === 0) return []

    const itemIDs = items.map((i: { ID: string }) => i.ID)

    // Single query to find which items already have at least one schedule line
    const linesPresent = await SELECT
      .from(SalesOrderScheduleLines)
      .columns('item_ID')
      .where({ item_ID: { in: itemIDs } })

    const itemIDsWithLines = new Set(
      linesPresent.map((sl: { item_ID: string }) => sl.item_ID)
    )

    return items
      .filter((item: { ID: string }) => !itemIDsWithLines.has(item.ID))
      .map((item: { itemNumber: number }) => item.itemNumber)
  }
}
