/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/lib/events.ts
 *  LAYER : Service — Domain Event Publisher
 *
 *  Wraps SAP Event Mesh emission via the CAP Outbox pattern.
 *
 *  CloudEvents 1.0 naming convention (SAP standard):
 *    type   : com.my.sales.<aggregate>.<verb>.v1
 *    source : /btp/<subaccount>/<appname>
 *
 *  Event catalogue (from ARCHITECTURE.md):
 *    com.my.sales.salesorder.created.v1
 *    com.my.sales.salesorder.submitted.v1
 *    com.my.sales.salesorder.delivered.v1
 *    com.my.sales.salesorder.deleted.v1
 *    com.my.sales.salesorder.item.added.v1
 *
 *  CAP Outbox — why it matters
 *  ────────────────────────────
 *  Without the Outbox, a direct `messaging.emit()` inside a handler
 *  runs OUTSIDE the database transaction.  If the HANA commit succeeds
 *  but the Event Mesh call fails (network timeout, topic unavailable),
 *  the event is lost — the domain state changed but consumers never
 *  received the notification.
 *
 *  With the Outbox configured (`"outbox": { "kind": "persistent-outbox" }`)
 *  in package.json, CAP writes the event to an OutboxMessages table in
 *  the SAME transaction as the domain change.  A background job picks
 *  up the row and delivers it to Event Mesh with retry.  No event is
 *  ever lost, even if Event Mesh is temporarily unavailable.
 *
 *  Development behaviour
 *  ─────────────────────
 *  When no `messaging` service is configured (local / unit test),
 *  `publish()` is a no-op and logs a debug message.  No code change
 *  is needed when switching to production — only configuration changes.
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'

const LOG = cds.log('events')


// ─── Event payload types ──────────────────────────────────────────

export interface OrderEventPayload {
  ID:          string
  salesOrder:  string
  [key: string]: unknown   // allow additional domain fields
}

export interface ItemEventPayload {
  itemID:       string
  orderID:      string
  itemNumber:   number
  [key: string]: unknown
}

export type EventPayload = OrderEventPayload | ItemEventPayload | Record<string, unknown>


// ─── EventPublisher ───────────────────────────────────────────────

export class EventPublisher {

  /** Cached messaging service — lazily initialised on first publish */
  private messaging: cds.Service | null | undefined = undefined

  /**
   * Publish a domain event via the CAP Outbox.
   *
   * @param type      CloudEvent type string
   *                  (e.g. 'com.my.sales.salesorder.submitted.v1')
   * @param data      Domain-relevant payload — no PII, no large blobs
   * @param subjectID Aggregate root ID — used as the CloudEvent subject
   *
   * Failure policy: event emission failures are logged but do NOT
   * roll back the domain transaction.  The CAP Outbox handles retries;
   * a failure here means the Outbox write itself failed, which is
   * extremely rare (same HANA transaction).
   */
  async publish(
    type:      string,
    data:      EventPayload,
    subjectID: string
  ): Promise<void> {
    try {
      const messaging = await this._getMessaging()
      if (!messaging) {
        LOG.debug(`[DEV] Would emit '${type}' for subject '${subjectID}'`, data)
        return
      }

      await messaging.emit({
        event: type,
        data:  {
          ...data,
          // CloudEvents 1.0 standard attributes
          specversion:     '1.0',
          type,
          source:          '/btp/sales-order-service',
          subject:         `/salesorder/${subjectID}`,
          datacontenttype: 'application/json',
          time:            new Date().toISOString()
        }
      })

      LOG.info(`Event '${type}' queued for subject '${subjectID}'`)

    } catch (err: unknown) {
      // Do NOT rethrow — event failure must not abort the domain commit
      LOG.warn(`Failed to queue event '${type}' for subject '${subjectID}':`, err)
    }
  }

  /**
   * Lazily connect to the messaging service.
   * Returns null if no messaging service is configured — allows the
   * handler to work in development without a real Event Mesh binding.
   */
  private async _getMessaging(): Promise<cds.Service | null> {
    if (this.messaging !== undefined) return this.messaging

    try {
      this.messaging = await cds.connect.to('messaging')
    } catch {
      // No messaging service configured — graceful no-op in dev
      this.messaging = null
    }

    return this.messaging
  }
}


// ─── Convenience constants ────────────────────────────────────────
// Import these in handlers to avoid magic strings.

export const EVENT_TYPES = {
  ORDER_CREATED:   'com.my.sales.salesorder.created.v1',
  ORDER_SUBMITTED: 'com.my.sales.salesorder.submitted.v1',
  ORDER_DELIVERED: 'com.my.sales.salesorder.delivered.v1',
  ORDER_DELETED:   'com.my.sales.salesorder.deleted.v1',
  ITEM_DELIVERY:   'com.my.sales.salesorder.item.added.v1'
} as const

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES]
