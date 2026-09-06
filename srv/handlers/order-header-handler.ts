/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/handlers/order-header-handler.ts
 *  LAYER : Service — SalesOrders Header Handlers
 *
 *  Responsibility (Single Responsibility Principle)
 *  ─────────────────────────────────────────────────
 *  Handles all events scoped to the SalesOrders root entity:
 *    • Guards    — block hard-DELETE, reject writes on deleted orders
 *    • Lifecycle — validate on CREATE, emit event after CREATE
 *    • Actions   — submitOrder, confirmDelivery, recalculatePricing,
 *                  logicalDelete
 *
 *  This class does NOT register its own hooks — it receives the service
 *  instance and calls `svc.before / on / after` in `register()`.
 *  This pattern allows the parent SalesOrderService orchestrator to
 *  control registration order across all sub-handlers.
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'

import { EVENT_TYPES }                from '../lib/events'
import type { SalesOrderValidator }   from '../lib/validations'
import type { StatusMachine }         from '../lib/status-machine'
import type { EventPublisher }        from '../lib/events'
import type {
  SalesOrder,
  ConfirmDeliveryData,
  LogicalDeleteData
} from '../types/domain'

const { SELECT, UPDATE, UPSERT } = cds.ql
const LOG = cds.log('OrderHeaderHandler')


export class OrderHeaderHandler {

  constructor(
    private readonly svc:          cds.ApplicationService,
    private readonly entities:     Record<string, any>,
    private readonly validator:    SalesOrderValidator,
    private readonly stateMachine: StatusMachine,
    private readonly publisher:    EventPublisher
  ) {}


  // ──────────────────────────────────────────────────────────────
  //  register() — attach all header-scoped hooks to the service
  // ──────────────────────────────────────────────────────────────

  register(): void {
    const { SalesOrders } = this.entities

    // Guards
    this.svc.before('DELETE', SalesOrders, (req) =>
      req.reject(405,
        'Physical DELETE is not permitted on SalesOrders. ' +
        'Use the logicalDelete bound action to soft-delete.'))

    this.svc.before('UPDATE', SalesOrders,
      this.guardLogicallyDeleted.bind(this))

    // Validation
    this.svc.before('CREATE', SalesOrders,
      this.validateNewOrder.bind(this))

    // Lifecycle
    this.svc.after('CREATE', SalesOrders,
      this.afterOrderCreated.bind(this))

    // Domain actions
    this.svc.on('submitOrder',        SalesOrders, this.onSubmitOrder.bind(this))
    this.svc.on('confirmDelivery',    SalesOrders, this.onConfirmDelivery.bind(this))
    this.svc.on('recalculatePricing', SalesOrders, this.onRecalculatePricing.bind(this))
    this.svc.on('logicalDelete',      SalesOrders, this.onLogicalDelete.bind(this))

    // ── Custom REST endpoints (non-OData) ──────────────────────────
    //
    // CAP permite registrar rotas HTTP puras dentro de um ApplicationService
    // usando this.svc.on('GET/POST', '/path', handler).
    //
    // Diferença chave vs. entidades OData:
    //   • A rota NÃO aparece no $metadata — é invisível para clientes OData
    //   • A resposta é JSON puro, sem envelope @odata.context
    //   • Ideal para: health checks, webhooks inbound, APIs de integração
    //     simples que não precisam de semântica OData
    //
    // Observe com DEBUG=cds:serve:
    //   [cds:serve] GET  /api/orders/health   → customHealthCheck
    //   [cds:serve] POST /api/orders/delivery-webhook → onDeliveryWebhook
    this.svc.on('GET',  '/health',            this.customHealthCheck.bind(this))
    this.svc.on('POST', '/delivery-webhook',  this.onDeliveryWebhook.bind(this))
  }


  // ──────────────────────────────────────────────────────────────
  //  Guard: reject UPDATE on logically deleted orders
  // ──────────────────────────────────────────────────────────────

  private async guardLogicallyDeleted(req: cds.Request): Promise<void> {
    const key = req.params?.[0] as { ID?: string } | undefined
    if (!key?.ID) return

    const { SalesOrders } = this.entities
    const row = await SELECT.one
      .from(SalesOrders)
      .columns('deletionIndicator', 'salesOrder')
      .where({ ID: key.ID })

    if (row?.deletionIndicator === 'X') {
      req.reject(422,
        `Sales order '${row.salesOrder}' (${key.ID}) is logically deleted ` +
        `and cannot be modified.`)
    }
  }


  // ──────────────────────────────────────────────────────────────
  //  Validation: before CREATE
  // ──────────────────────────────────────────────────────────────

  private async validateNewOrder(req: cds.Request): Promise<void> {
    await this.validator.validateNewOrder(
      req.data as Partial<SalesOrder>, req
    )
  }


  // ──────────────────────────────────────────────────────────────
  //  Lifecycle: after CREATE
  // ──────────────────────────────────────────────────────────────

  private async afterOrderCreated(result: SalesOrder | SalesOrder[]): Promise<void> {
    const orders        = Array.isArray(result) ? result : [result]
    const { SalesOrders } = this.entities

    for (const order of orders) {
      const eventType = EVENT_TYPES.ORDER_CREATED
      const now       = new Date()

      await UPDATE.entity(SalesOrders)
        .set({ lastEventType: eventType, lastEventAt: now })
        .where({ ID: order.ID })

      await this.publisher.publish(
        eventType,
        { ID: order.ID, salesOrder: order.salesOrder },
        order.ID
      )
    }
  }


  // ──────────────────────────────────────────────────────────────
  //  Action: submitOrder — Open (A) → InProcess (B)
  // ──────────────────────────────────────────────────────────────

  async onSubmitOrder(req: cds.Request): Promise<SalesOrder | void> {
    const key = req.params[0] as { ID: string }
    const { SalesOrders, SalesOrderPartners, BusinessPartners } = this.entities

    // SELECT.forUpdate() — lock pessimista sobre o registro do pedido.
    //
    // Por que é necessário aqui:
    //   submitOrder é uma transição de estado (Open → InProcess) que NÃO
    //   pode ocorrer duas vezes.  Sem lock, duas chamadas simultâneas
    //   passariam ambas pela validação overallStatus === 'A' e gravariam
    //   o status 'B' duas vezes — inofensivo neste caso, mas o padrão
    //   se tornaria perigoso em transições irreversíveis (ex: faturamento).
    //
    // wait: 5 → aguarda até 5 segundos pelo lock antes de lançar erro 409.
    //   Em HANA Cloud: emite SELECT ... FOR UPDATE WAIT 5
    //   Em SQLite (dev/test): emite SELECT ... (SQLite não suporta FOR UPDATE
    //   mas o CAP aceita a chamada sem erro — o comportamento de lock é
    //   melhor testado em HANA ou com testes serializados)
    //
    // O que observar com DEBUG=cds:sql:
    //   [cds:sql] SELECT ID, salesOrder, ... FROM SalesOrders
    //             WHERE ID = ? FOR UPDATE WAIT 5
    const order = await SELECT.one
      .from(SalesOrders)
      .columns('ID', 'salesOrder', 'overallStatus', 'deliveryStatus',
               'billingStatus', 'deletionIndicator')
      .where({ ID: key.ID })
      .forUpdate({ wait: 5 })

    if (!order)
      return req.reject(404, `Sales order ${key.ID} not found.`)

    if (order.deletionIndicator === 'X')
      return req.reject(422, `Sales order '${order.salesOrder}' is logically deleted.`)

    if (order.overallStatus !== 'A') {
      const label = this.stateMachine.overallStatusLabel(order.overallStatus)
      return req.reject(422,
        `Cannot submit order '${order.salesOrder}': ` +
        `current status is '${label}' (${order.overallStatus}). ` +
        `Only Open (A) orders can be submitted.`)
    }

    const soldTo = await SELECT.one
      .from(SalesOrderPartners)
      .columns('partner_ID', 'partnerName')
      .where({ order_ID: key.ID, role: 'AG' })

    if (!soldTo)
      return req.reject(422,
        `Order '${order.salesOrder}': a sold-to partner (function AG) ` +
        `is required before submission.`)

    if (!soldTo.partner_ID)
      return req.reject(422,
        `Order '${order.salesOrder}': sold-to partner '${soldTo.partnerName}' ` +
        `is not linked to a BusinessPartners master record. ` +
        `Resolve the partner reference before submitting.`)

    const bp = await SELECT.one
      .from(BusinessPartners)
      .columns('blocked', 'name', 'code')
      .where({ ID: soldTo.partner_ID })

    if (!bp)
      return req.reject(422,
        `Sold-to partner record ${soldTo.partner_ID} not found in master data.`)

    if (bp.blocked)
      return req.reject(422,
        `Sold-to partner '${soldTo.partnerName}' (${bp.code}) is blocked. ` +
        `Release the delivery or credit block before submitting.`)

    const missingLines = await this.validator.findItemsMissingScheduleLines(key.ID)
    if (missingLines.length > 0) {
      return req.reject(422,
        `Cannot submit order '${order.salesOrder}': ` +
        `the following items have no delivery schedule lines: ` +
        `${missingLines.join(', ')}. ` +
        `Add at least one schedule line per item before submitting.`)
    }

    const eventType = EVENT_TYPES.ORDER_SUBMITTED
    const now       = new Date()

    await UPDATE.entity(SalesOrders)
      .set({ overallStatus: 'B', lastEventType: eventType, lastEventAt: now })
      .where({ ID: key.ID })

    await this.publisher.publish(
      eventType,
      { ID: key.ID, salesOrder: order.salesOrder as string },
      key.ID
    )

    LOG.info(`Order '${order.salesOrder}' submitted — status → InProcess (B)`)

    return await SELECT.one.from(SalesOrders).where({ ID: key.ID }) as SalesOrder
  }


  // ──────────────────────────────────────────────────────────────
  //  Action: confirmDelivery — deliveryStatus → FullyDelivered (C)
  // ──────────────────────────────────────────────────────────────

  async onConfirmDelivery(req: cds.Request): Promise<SalesOrder | void> {
    const key             = req.params[0] as { ID: string }
    const { comment }     = (req.data ?? {}) as ConfirmDeliveryData
    const { SalesOrders, SalesOrderHeaderTexts } = this.entities

    // Lock pessimista — confirmDelivery é transição irreversível (→ 'C').
    const order = await SELECT.one
      .from(SalesOrders)
      .columns('ID', 'salesOrder', 'overallStatus', 'deliveryStatus',
               'billingStatus', 'deletionIndicator')
      .where({ ID: key.ID })
      .forUpdate({ wait: 5 })

    if (!order)
      return req.reject(404, `Sales order ${key.ID} not found.`)

    if (order.deletionIndicator === 'X')
      return req.reject(422, `Sales order '${order.salesOrder}' is logically deleted.`)

    if (!this.stateMachine.canTransitionDelivery(order.deliveryStatus ?? 'A', 'C'))
      return req.reject(422,
        `Cannot transition delivery status from ` +
        `'${this.stateMachine.deliveryStatusLabel(order.deliveryStatus ?? 'A')}' ` +
        `to Fully Delivered.`)

    const newOverall = this.stateMachine.computeOverallStatus('C', order.billingStatus)
    const eventType  = EVENT_TYPES.ORDER_DELIVERED
    const now        = new Date()

    await UPDATE.entity(SalesOrders)
      .set({
        deliveryStatus: 'C',
        overallStatus:  newOverall,
        lastEventType:  eventType,
        lastEventAt:    now
      })
      .where({ ID: key.ID })

    if (comment) {
      const lang = (req.locale ?? 'en').substring(0, 2)
      await UPSERT.into(SalesOrderHeaderTexts).entries({
        order_ID:   key.ID,
        textId:     'ZCON',
        language:   lang,
        text:       comment,
        createdAt:  now,
        createdBy:  req.user?.id,
        modifiedAt: now,
        modifiedBy: req.user?.id
      })
    }

    await this.publisher.publish(
      eventType,
      { ID: key.ID, salesOrder: order.salesOrder as string, comment },
      key.ID
    )

    LOG.info(`Order '${order.salesOrder}' delivery confirmed — overall → ${newOverall}`)

    return await SELECT.one.from(SalesOrders).where({ ID: key.ID }) as SalesOrder
  }


  // ──────────────────────────────────────────────────────────────
  //  Action: recalculatePricing
  // ──────────────────────────────────────────────────────────────

  async onRecalculatePricing(req: cds.Request): Promise<SalesOrder | void> {
    const key = req.params[0] as { ID: string }
    const { SalesOrders, SalesOrderItems, SalesOrderItemConditions } = this.entities

    const order = await SELECT.one
      .from(SalesOrders)
      .columns('ID', 'salesOrder', 'deletionIndicator')
      .where({ ID: key.ID })

    if (!order)
      return req.reject(404, `Sales order ${key.ID} not found.`)
    if (order.deletionIndicator === 'X')
      return req.reject(422, `Sales order '${order.salesOrder}' is logically deleted.`)

    const items = await SELECT
      .from(SalesOrderItems)
      .columns('ID', 'orderQuantity')
      .where({ order_ID: key.ID, deletionIndicator: ' ' })

    const itemIDs = items.map((i: { ID?: string }) => i.ID as string).filter(Boolean)
    const allConditions = itemIDs.length > 0
      ? await SELECT
          .from(SalesOrderItemConditions)
          .columns('item_ID', 'conditionStep', 'conditionRate',
                   'conditionBase', 'calculationType', 'statisticalFlag')
          .where({ item_ID: { in: itemIDs } })
          .orderBy('item_ID', 'conditionStep')
      : []

    const conditionsByItem = new Map<string, typeof allConditions>()
    for (const c of allConditions) {
      const id = c.item_ID as string
      if (!conditionsByItem.has(id)) conditionsByItem.set(id, [])
      conditionsByItem.get(id)!.push(c)
    }

    type ConditionUpdate = { item_ID: string; conditionStep: number; conditionValue: number }
    const conditionUpdates: ConditionUpdate[] = []
    const itemNetAmounts   = new Map<string, number>()
    let headerNet = 0

    for (const item of items) {
      const conditions = conditionsByItem.get(item.ID as string) ?? []
      const qty        = (item.orderQuantity as number) ?? 0
      let   itemNet    = 0

      for (const c of conditions) {
        const val = this._computeConditionValue(
          c.calculationType as string,
          (c.conditionRate as number) ?? 0,
          qty,
          (c.conditionBase as number) ?? 1
        )
        conditionUpdates.push({
          item_ID:        item.ID as string,
          conditionStep:  c.conditionStep as number,
          conditionValue: val
        })
        if (!c.statisticalFlag) itemNet += val
      }
      itemNetAmounts.set(item.ID as string, itemNet)
      headerNet += itemNet
    }

    await Promise.all(
      conditionUpdates.map(u =>
        UPDATE.entity(SalesOrderItemConditions)
          .set({ conditionValue: u.conditionValue })
          .where({ item_ID: u.item_ID, conditionStep: u.conditionStep })
      )
    )

    await Promise.all(
      [...itemNetAmounts.entries()].map(([id, net]) =>
        UPDATE.entity(SalesOrderItems)
          .set({ netAmount: net })
          .where({ ID: id })
      )
    )

    await UPDATE.entity(SalesOrders)
      .set({ netAmount: headerNet })
      .where({ ID: key.ID })

    LOG.info(`Pricing recalculated for order '${order.salesOrder}': ` +
             `${items.length} items, header netAmount = ${headerNet}`)

    return await SELECT.one.from(SalesOrders).where({ ID: key.ID }) as SalesOrder
  }


  // ──────────────────────────────────────────────────────────────
  //  Action: logicalDelete
  // ──────────────────────────────────────────────────────────────

  async onLogicalDelete(req: cds.Request): Promise<SalesOrder | void> {
    const key         = req.params[0] as { ID: string }
    const { reason }  = (req.data ?? {}) as LogicalDeleteData
    const { SalesOrders, SalesOrderItems, SalesOrderHeaderTexts } = this.entities

    // Lock pessimista — logicalDelete é irreversível (deletionIndicator → 'X').
    const order = await SELECT.one
      .from(SalesOrders)
      .columns('ID', 'salesOrder', 'deletionIndicator')
      .where({ ID: key.ID })
      .forUpdate({ wait: 5 })

    if (!order)
      return req.reject(404, `Sales order ${key.ID} not found.`)
    if (order.deletionIndicator === 'X')
      return req.reject(422,
        `Sales order '${order.salesOrder}' is already logically deleted.`)

    const eventType = EVENT_TYPES.ORDER_DELETED
    const now       = new Date()

    await UPDATE.entity(SalesOrders)
      .set({ deletionIndicator: 'X', lastEventType: eventType, lastEventAt: now })
      .where({ ID: key.ID })

    await UPDATE.entity(SalesOrderItems)
      .set({ deletionIndicator: 'X' })
      .where({ order_ID: key.ID, deletionIndicator: ' ' })

    if (reason) {
      const lang = (req.locale ?? 'en').substring(0, 2)
      await UPSERT.into(SalesOrderHeaderTexts).entries({
        order_ID:   key.ID,
        textId:     'ZDEL',
        language:   lang,
        text:       reason,
        createdAt:  now,
        createdBy:  req.user?.id,
        modifiedAt: now,
        modifiedBy: req.user?.id
      })
    }

    await this.publisher.publish(
      eventType,
      { ID: key.ID, salesOrder: order.salesOrder as string, reason },
      key.ID
    )

    LOG.info(`Order '${order.salesOrder}' logically deleted by ${req.user?.id}`)

    return await SELECT.one.from(SalesOrders).where({ ID: key.ID }) as SalesOrder
  }


  // ──────────────────────────────────────────────────────────────
  //  Custom REST: GET /api/orders/health
  //
  //  Health check específico do domínio.  Retorna contadores de
  //  pedidos por status sem expor dados sensíveis.
  //
  //  Resposta (JSON puro — sem envelope OData):
  //    {
  //      "status": "ok",
  //      "timestamp": "2026-04-11T...",
  //      "orders": { "open": 3, "inProcess": 1, "completed": 0 }
  //    }
  //
  //  curl -u alice:alice http://localhost:4004/api/orders/health
  // ──────────────────────────────────────────────────────────────

  async customHealthCheck(_req: cds.Request): Promise<object> {
    const { SalesOrders } = this.entities

    // Três queries paralelas — uma por status relevante
    const [open, inProcess, completed] = await Promise.all([
      SELECT.one.from(SalesOrders)
        .columns('count(*) as n')
        .where({ overallStatus: 'A', deletionIndicator: ' ' }),
      SELECT.one.from(SalesOrders)
        .columns('count(*) as n')
        .where({ overallStatus: 'B', deletionIndicator: ' ' }),
      SELECT.one.from(SalesOrders)
        .columns('count(*) as n')
        .where({ overallStatus: 'C', deletionIndicator: ' ' })
    ])

    return {
      status   : 'ok',
      timestamp: new Date().toISOString(),
      orders   : {
        open      : Number((open  as { n: number })?.n ?? 0),
        inProcess : Number((inProcess as { n: number })?.n ?? 0),
        completed : Number((completed as { n: number })?.n ?? 0)
      }
    }
  }


  // ──────────────────────────────────────────────────────────────
  //  Custom REST: POST /api/orders/delivery-webhook
  //
  //  Recebe notificação de confirmação de entrega de um sistema
  //  externo (ex.: WMS — Warehouse Management System) via webhook.
  //
  //  Payload esperado:
  //    { "salesOrder": "0000000001", "confirmedAt": "2026-04-11T10:00:00Z" }
  //
  //  O handler localiza o pedido pelo número de negócio e dispara
  //  a lógica de confirmDelivery já existente, reutilizando todas
  //  as validações de estado e emissão de evento.
  //
  //  Por que REST e não OData action:
  //    • O WMS externo não conhece a estrutura OData nem os IDs UUID
  //    • O número de pedido (salesOrder / VBELN) é o identificador
  //      que o WMS usa — o endpoint faz a resolução UUID internamente
  //    • O payload é simples e fixo — não justifica a semântica OData
  //
  //  curl -u bob:bob -X POST http://localhost:4004/api/orders/delivery-webhook \
  //    -H "Content-Type: application/json" \
  //    -d '{"salesOrder":"0000000001","confirmedAt":"2026-04-11T10:00:00Z"}'
  // ──────────────────────────────────────────────────────────────

  async onDeliveryWebhook(req: cds.Request): Promise<object> {
    const { salesOrder, confirmedAt } = (req.data ?? {}) as {
      salesOrder  ?: string
      confirmedAt ?: string
    }

    if (!salesOrder)
      return req.reject(400, 'Missing required field: salesOrder')

    const { SalesOrders } = this.entities

    // Resolve o número de negócio para UUID
    const order = await SELECT.one
      .from(SalesOrders)
      .columns('ID', 'salesOrder', 'deliveryStatus', 'deletionIndicator')
      .where({ salesOrder })

    if (!order)
      return req.reject(404, `Order '${salesOrder}' not found.`)

    if (order.deletionIndicator === 'X')
      return req.reject(422, `Order '${salesOrder}' is logically deleted.`)

    if (order.deliveryStatus === 'C')
      // Idempotente — já confirmado, retorna 200 sem re-processar
      return { accepted: true, idempotent: true, salesOrder, message: 'Already fully delivered.' }

    // Delega para a lógica existente de confirmDelivery
    const comment = confirmedAt
      ? `Delivery confirmed by WMS at ${confirmedAt}`
      : 'Delivery confirmed by WMS webhook'

    // Reutiliza onConfirmDelivery criando um req sintético compatível
    const syntheticReq = Object.assign(Object.create(req), {
      params : [{ ID: order.ID as string }],
      data   : { comment },
      user   : req.user
    })

    await this.onConfirmDelivery(syntheticReq as cds.Request)

    LOG.info(`Webhook: delivery confirmed for order '${salesOrder}' at ${confirmedAt ?? 'unknown time'}`)

    return {
      accepted   : true,
      idempotent : false,
      salesOrder,
      orderID    : order.ID,
      message    : 'Delivery confirmation processed successfully.'
    }
  }


  // ──────────────────────────────────────────────────────────────
  //  Private helper: pricing condition calculation (KONV KRECH)
  // ──────────────────────────────────────────────────────────────

  private _computeConditionValue(
    type: string,
    rate: number,
    qty:  number,
    base: number
  ): number {
    const safeBase = base || 1
    switch (type) {
      case 'A': return (qty * rate) / 100       // Percentage
      case 'B': return (qty / safeBase) * rate   // Per-quantity
      case 'C': return rate                      // Fixed amount
      default:  return 0
    }
  }
}
