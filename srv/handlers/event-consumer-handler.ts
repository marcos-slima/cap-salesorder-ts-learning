/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/handlers/event-consumer-handler.ts
 *  LAYER : Service — Inbound Event Consumer (Messaging bidirecional)
 *
 *  Responsabilidade
 *  ────────────────
 *  Escuta eventos publicados por sistemas externos (ex.: WMS, TMS)
 *  via SAP Event Mesh e os traduz em ações de domínio locais.
 *
 *  Contraste com o EventPublisher (events.ts)
 *  ───────────────────────────────────────────
 *  EventPublisher  → PUBLICA eventos (domínio → Event Mesh)
 *  EventConsumer   → CONSOME eventos (Event Mesh → domínio)
 *
 *  Juntos, eles fecham o ciclo de integração orientada a eventos:
 *
 *    SalesOrders (local)
 *        │  submitOrder action
 *        ▼
 *    CAP Outbox ──► Event Mesh ──► WMS (confirma entrega)
 *                                      │
 *                                      │  wms/delivery/confirmed/v1
 *                                      ▼
 *                              EventConsumer (este arquivo)
 *                                      │  confirmDelivery action
 *                                      ▼
 *                              SalesOrders.deliveryStatus = 'C'
 *
 *  Como o CAP processa mensagens recebidas
 *  ─────────────────────────────────────────
 *  1. O `messaging` service (file-based em dev, Event Mesh em prod)
 *     chama o handler registrado para cada tópico assinado.
 *  2. O handler recebe um objeto `msg` com `msg.data` (payload JSON)
 *     e `msg.headers` (CloudEvents 1.0 headers).
 *  3. Se o handler lançar erro, o CAP tenta redelivery (comportamento
 *     configurável no Event Mesh — DLQ, max retries, backoff).
 *
 *  Idempotência — por que é obrigatória aqui
 *  ──────────────────────────────────────────
 *  O Event Mesh garante entrega "at-least-once" — a mesma mensagem
 *  pode chegar mais de uma vez (redelivery após timeout, restart).
 *  O handler DEVE ser idempotente: processar a mesma mensagem duas
 *  vezes não pode causar efeito colateral diferente.
 *
 *  Estratégia adotada:
 *    • Verifica o status atual ANTES de aplicar a transição.
 *    • Se deliveryStatus já é 'C' (FullyDelivered), loga e retorna
 *      sem erro — mensagem duplicada é descartada silenciosamente.
 *    • Usa SELECT.forUpdate() para prevenir race condition entre
 *      duas entregas simultâneas da mesma mensagem.
 *
 *  Desenvolvimento sem Event Mesh real
 *  ─────────────────────────────────────
 *  Em dev, o `messaging` usa `file-based-messaging` (configurado em
 *  package.json > cds.requires.messaging).  Mensagens são escritas
 *  em arquivos JSON na pasta .messaging/ da raiz do projeto.
 *
 *  Para simular uma mensagem recebida em dev:
 *    npx cds-ts emit wms/delivery/confirmed/v1 \
 *      '{"salesOrder":"0000000001","confirmedAt":"2026-04-11T10:00:00Z"}'
 *
 *  Observe com DEBUG=cds:messaging:
 *    [cds:messaging] ← wms/delivery/confirmed/v1 { salesOrder: '...', ... }
 *    [cds:messaging] → processing message ...
 *
 *  Tópicos consumidos
 *  ───────────────────
 *  wms/delivery/confirmed/v1  → WMS confirma entrega de pedido
 *  tms/shipment/dispatched/v1 → TMS informa despacho de carga
 *
 *  Tópicos publicados (pelo EventPublisher existente — para referência)
 *  ─────────────────────────────────────────────────────────────────────
 *  com/my/sales/salesorder/submitted/v1  → WMS inicia separação
 *  com/my/sales/salesorder/delivered/v1  → Billing inicia faturamento
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'
import { EVENT_TYPES } from '../lib/events'

const { SELECT, UPDATE } = cds.ql
const LOG = cds.log('EventConsumer')


// ── Tipos dos payloads recebidos ──────────────────────────────────

interface DeliveryConfirmedPayload {
    salesOrder  : string   // número de negócio (VBELN)
    confirmedAt?: string   // ISO 8601 timestamp
    reference?  : string   // referência do WMS (ex.: delivery note number)
}

interface ShipmentDispatchedPayload {
    salesOrder   : string
    trackingCode?: string
    carrier?     : string
    dispatchedAt?: string
}


// ══════════════════════════════════════════════════════════════════
//  EventConsumerHandler — registra subscriptions no boot do servidor
// ══════════════════════════════════════════════════════════════════

export class EventConsumerHandler {

    /**
     * register() — conecta ao messaging service e assina os tópicos.
     *
     * Chamado pelo SalesOrderService.init() após o super.init().
     * O `cds.connect.to('messaging')` retorna null/lança em dev se
     * não houver binding — o método trata este caso graciosamente.
     */
    static async register(): Promise<void> {
        let messaging: cds.Service

        try {
            messaging = await cds.connect.to('messaging')
        } catch {
            // Sem messaging configurado (unit tests sem mock) — no-op.
            LOG.debug('No messaging service configured — event consumer disabled.')
            return
        }

        // ── Subscription 1: confirmação de entrega do WMS ────────
        //
        // Tópico: wms/delivery/confirmed/v1
        // Publicador: sistema WMS após confirmar baixa de estoque
        // Ação local: confirmDelivery(comment) no pedido correspondente
        messaging.on('wms/delivery/confirmed/v1', async (msg: any) => {
            await EventConsumerHandler._handleDeliveryConfirmed(
                msg.data as DeliveryConfirmedPayload
            )
        })

        // ── Subscription 2: despacho de carga do TMS ─────────────
        //
        // Tópico: tms/shipment/dispatched/v1
        // Publicador: sistema TMS após registrar saída do veículo
        // Ação local: registrar texto de acompanhamento no pedido
        messaging.on('tms/shipment/dispatched/v1', async (msg: any) => {
            await EventConsumerHandler._handleShipmentDispatched(
                msg.data as ShipmentDispatchedPayload
            )
        })

        LOG.info('Event consumer subscribed: wms/delivery/confirmed/v1, tms/shipment/dispatched/v1')
    }


    // ──────────────────────────────────────────────────────────────
    //  Handler: wms/delivery/confirmed/v1
    // ──────────────────────────────────────────────────────────────

    private static async _handleDeliveryConfirmed(
        payload: DeliveryConfirmedPayload
    ): Promise<void> {
        const { salesOrder, confirmedAt, reference } = payload

        if (!salesOrder) {
            LOG.warn('wms/delivery/confirmed/v1: missing salesOrder — message ignored')
            return
        }

        LOG.info(`Processing delivery confirmation for order '${salesOrder}'`)

        // Resolve número de negócio → UUID com lock pessimista
        // (idêntico ao onSubmitOrder — previne race condition)
        const db = await cds.connect.to('db')

        const order = await db.run(
            SELECT.one
                .from('com.my.sales.SalesOrders')
                .columns('ID', 'salesOrder', 'deliveryStatus', 'billingStatus', 'deletionIndicator')
                .where({ salesOrder })
                .forUpdate({ wait: 5 })
        )

        if (!order) {
            LOG.warn(`wms/delivery/confirmed/v1: order '${salesOrder}' not found — skipped`)
            return
        }

        if (order.deletionIndicator === 'X') {
            LOG.warn(`wms/delivery/confirmed/v1: order '${salesOrder}' is deleted — skipped`)
            return
        }

        // ── Idempotência ─────────────────────────────────────────
        // Se já está FullyDelivered ('C'), a mensagem é duplicada.
        // Descartar silenciosamente — não lançar erro para evitar
        // redelivery desnecessário pelo Event Mesh.
        if (order.deliveryStatus === 'C') {
            LOG.info(
                `wms/delivery/confirmed/v1: order '${salesOrder}' already FullyDelivered — ` +
                `idempotent discard`
            )
            return
        }

        // Calcula novo overallStatus baseado no billingStatus atual
        const newOverall = order.billingStatus === 'C' ? 'C' : 'B'
        const now        = new Date()

        // Aplica a transição de estado diretamente via db (não via
        // SalesOrderService para evitar dependência circular).
        // As validações já foram feitas acima.
        await db.run(
            (UPDATE as any)('com.my.sales.SalesOrders')
                .set({
                    deliveryStatus : 'C',
                    overallStatus  : newOverall,
                    lastEventType  : EVENT_TYPES.ORDER_DELIVERED,
                    lastEventAt    : now
                })
                .where({ ID: order.ID })
        )

        // Registra texto de rastreamento no pedido
        const commentParts = ['Delivery confirmed by WMS']
        if (confirmedAt) commentParts.push(`at ${confirmedAt}`)
        if (reference)   commentParts.push(`(ref: ${reference})`)

        await db.run(
            // UPSERT — idempotente se a mensagem chegar duas vezes
            cds.ql.UPSERT.into('com.my.sales.SalesOrderHeaderTexts').entries({
                order_ID  : order.ID,
                textId    : 'ZWMS',
                language  : 'en',
                text      : commentParts.join(' '),
                createdAt : now,
                createdBy : 'wms-consumer',
                modifiedAt: now,
                modifiedBy: 'wms-consumer'
            })
        )

        LOG.info(
            `Order '${salesOrder}': deliveryStatus → C, overallStatus → ${newOverall} ` +
            `(via WMS event)`
        )
    }


    // ──────────────────────────────────────────────────────────────
    //  Handler: tms/shipment/dispatched/v1
    // ──────────────────────────────────────────────────────────────

    private static async _handleShipmentDispatched(
        payload: ShipmentDispatchedPayload
    ): Promise<void> {
        const { salesOrder, trackingCode, carrier, dispatchedAt } = payload

        if (!salesOrder) {
            LOG.warn('tms/shipment/dispatched/v1: missing salesOrder — message ignored')
            return
        }

        const db    = await cds.connect.to('db')
        const order = await db.run(
            SELECT.one
                .from('com.my.sales.SalesOrders')
                .columns('ID', 'deletionIndicator')
                .where({ salesOrder })
        )

        if (!order || order.deletionIndicator === 'X') {
            LOG.warn(`tms/shipment/dispatched/v1: order '${salesOrder}' not found or deleted`)
            return
        }

        const parts = ['Shipment dispatched by TMS']
        if (carrier)      parts.push(`carrier: ${carrier}`)
        if (trackingCode) parts.push(`tracking: ${trackingCode}`)
        if (dispatchedAt) parts.push(`at ${dispatchedAt}`)

        const now = new Date()

        await db.run(
            cds.ql.UPSERT.into('com.my.sales.SalesOrderHeaderTexts').entries({
                order_ID  : order.ID,
                textId    : 'ZTMS',
                language  : 'en',
                text      : parts.join(' — '),
                createdAt : now,
                createdBy : 'tms-consumer',
                modifiedAt: now,
                modifiedBy: 'tms-consumer'
            })
        )

        LOG.info(`Order '${salesOrder}': shipment dispatch recorded (${trackingCode ?? 'no tracking'})`)
    }
}
