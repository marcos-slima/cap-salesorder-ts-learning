/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/lib/status-machine.ts
 *  LAYER : Service — Domain Status Machine
 *
 *  Encapsulates all valid status transitions for the SalesOrder
 *  aggregate.  Making the rules explicit and testable in isolation
 *  follows the Single Responsibility Principle — the service handler
 *  delegates "is this transition allowed?" to this class and focuses
 *  on persistence and event emission.
 *
 *  SAP reference
 *  ─────────────
 *  The status triple (overall / delivery / billing) mirrors VBUK:
 *    GBSTK  overall processing status
 *    LFSTK  delivery status
 *    FKSTK  billing / invoicing status
 *
 *  In S/4HANA, status computation is performed by FORM routines in
 *  program RV45AFZZ (user exits) and the standard VOFM condition
 *  routines.  Here we replicate the core derivation logic in a
 *  clean TypeScript class that is independent of CAP's runtime.
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  OverallOrderStatus,
  DeliveryStatus,
  BillingStatus
} from '../types/domain'


// ─── Transition maps ──────────────────────────────────────────────
// Each key is a "from" status.  Values are the set of valid "to" states.
// An empty array means the status is terminal (no further transitions).

type StatusTransitionMap<T extends string> = Record<T, T[]>

const OVERALL_TRANSITIONS: StatusTransitionMap<OverallOrderStatus> = {
  'A': ['B'],    // Open → InProcess  (via submitOrder)
  'B': ['C'],    // InProcess → Completed  (computed when delivery+billing = C)
  'C': [],       // Completed — terminal
  ' ': ['A']     // NotRelevant → Open (edge case: order type activation)
}

const DELIVERY_TRANSITIONS: StatusTransitionMap<DeliveryStatus> = {
  'A': ['B', 'C'],  // NotDelivered → Partial or Full (via confirmDelivery)
  'B': ['C'],       // PartiallyDelivered → FullyDelivered
  'C': [],          // FullyDelivered — terminal
  ' ': ['A']
}

const BILLING_TRANSITIONS: StatusTransitionMap<BillingStatus> = {
  'A': ['B', 'C'],
  'B': ['C'],
  'C': [],
  ' ': ['A']
}


// ─── StatusMachine ────────────────────────────────────────────────

export class StatusMachine {

  /**
   * Compute the overall order status from delivery and billing statuses.
   *
   * Derivation rule (mirrors VBUK.GBSTK logic):
   *   delivery = C  AND  billing = C   → Completed  (C)
   *   delivery ≠ A  OR   billing ≠ A   → InProcess  (B)
   *   both = A (or not relevant)       → Open       (A)
   *
   * Call this whenever either delivery or billing status changes.
   */
  computeOverallStatus(
    deliveryStatus: DeliveryStatus | undefined,
    billingStatus:  BillingStatus  | undefined
  ): OverallOrderStatus {
    const d = deliveryStatus ?? 'A'
    const b = billingStatus  ?? 'A'

    if (d === 'C' && b === 'C') return 'C'   // Completed
    if (d !== 'A' || b !== 'A') return 'B'   // InProcess
    return 'A'                               // Open
  }

  /**
   * Check whether a transition from → to is valid for overall status.
   * Used to produce a helpful error before rejecting a domain action.
   */
  canTransitionOverall(from: OverallOrderStatus, to: OverallOrderStatus): boolean {
    return OVERALL_TRANSITIONS[from]?.includes(to) ?? false
  }

  /** Check whether a delivery status transition is valid. */
  canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
    return DELIVERY_TRANSITIONS[from]?.includes(to) ?? false
  }

  /** Check whether a billing status transition is valid. */
  canTransitionBilling(from: BillingStatus, to: BillingStatus): boolean {
    return BILLING_TRANSITIONS[from]?.includes(to) ?? false
  }

  /**
   * Human-readable label for a status code.
   * Used in error messages so that consumers don't see raw single-char codes.
   */
  overallStatusLabel(status: OverallOrderStatus): string {
    const labels: Record<OverallOrderStatus, string> = {
      'A': 'Open',
      'B': 'In Process',
      'C': 'Completed',
      ' ': 'Not Relevant'
    }
    return labels[status] ?? status
  }

  deliveryStatusLabel(status: DeliveryStatus): string {
    const labels: Record<DeliveryStatus, string> = {
      'A': 'Not Delivered',
      'B': 'Partially Delivered',
      'C': 'Fully Delivered',
      ' ': 'Not Relevant'
    }
    return labels[status] ?? status
  }

  billingStatusLabel(status: BillingStatus): string {
    const labels: Record<BillingStatus, string> = {
      'A': 'Not Billed',
      'B': 'Partially Billed',
      'C': 'Fully Billed',
      ' ': 'Not Relevant'
    }
    return labels[status] ?? status
  }
}
