/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/handlers/sales-order-service.ts
 *  LAYER : Service — SalesOrderService Orchestrator
 *
 *  Responsibility
 *  ──────────────
 *  Thin orchestrator: instantiates collaborators and composes the two
 *  sub-handlers that implement the actual domain logic.
 *
 *  Sub-handlers
 *  ─────────────
 *  OrderHeaderHandler — guards, lifecycle, and domain actions scoped
 *                       to the SalesOrders root entity.
 *  OrderItemHandler   — invariant #1 (netAmount sync) and the
 *                       addToDelivery action on SalesOrderItems.
 *
 *  Why composed sub-handlers?
 *  ───────────────────────────
 *  The original single-class handler grew to ~820 lines covering two
 *  distinct entity scopes.  Splitting by entity boundary follows the
 *  Single Responsibility Principle: each sub-handler can be read,
 *  tested, and modified without touching the other.
 *
 *  CAP loading convention
 *  ──────────────────────
 *  CAP resolves `SalesOrderService` → `srv/sales-order-service.{js,ts}`
 *  automatically when `"typescript": true` is set in package.json["cds"].
 *  The top-level `srv/sales-order-service.ts` re-exports this class as
 *  default; no `@impl` annotation is required.
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'

import { SalesOrderValidator }  from '../lib/validations'
import { StatusMachine }        from '../lib/status-machine'
import { EventPublisher }       from '../lib/events'
import { OrderHeaderHandler }   from './order-header-handler'
import { OrderItemHandler }     from './order-item-handler'
import { EventConsumerHandler } from './event-consumer-handler'


export default class SalesOrderService extends cds.ApplicationService {

  // Collaborators — initialised in init() once the CDS runtime is ready.
  // NOTE: avoid property names that overlap with cds.Service internals
  // (name, model, entities, events, operations, handlers, definition …).
  private validator!:    SalesOrderValidator
  private stateMachine!: StatusMachine
  private publisher!:    EventPublisher


  // ──────────────────────────────────────────────────────────────
  //  init() — compose sub-handlers and register all event hooks
  // ──────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await super.init()

    const serviceName = this.name

    // Guard: CAP's _sibling() discovery associates this file with every
    // service defined in sales-order-service.cds (SalesCatalogService,
    // SalesAnalyticsService as well). Register handlers only for
    // transactional services that expose SalesOrders.
    const isTransactionalService =
      serviceName.endsWith('SalesOrderService') ||
      serviceName.endsWith('SalesOperationalService')

    if (!isTransactionalService || !this.entities['SalesOrders']) return

    this.validator    = new SalesOrderValidator(this.entities)
    this.stateMachine = new StatusMachine()
    this.publisher    = new EventPublisher()

    // Compose and register sub-handlers.
    // Registration order matters for `before` hooks (FIFO):
    //   1. Header handler registers the DELETE-405 guard and UPDATE guard first.
    //   2. Item handler registers after — no ordering conflict with header hooks.
    new OrderHeaderHandler(
      this, this.entities, this.validator, this.stateMachine, this.publisher
    ).register()

    new OrderItemHandler(
      this, this.entities, this.publisher
    ).register()

    // Messaging bidirecional — inbound event consumer.
    // Register only once on the canonical transactional service to
    // avoid duplicate subscriptions when multiple services share
    // the same handlers.
    if (serviceName.endsWith('SalesOrderService')) {
      await EventConsumerHandler.register()
    }
  }
}
