/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/integration/northwind-remote-client.ts
 *  LAYER : Integration — Northwind Remote Service Client (declarativo)
 *
 *  Responsabilidade
 *  ────────────────
 *  Substituição declarativa do NorthwindClient imperativo.
 *  Em vez de construir URLs OData manualmente e desembrulhar value[],
 *  este cliente usa `cds.connect.to('Northwind')` e executa CQL —
 *  o mesmo código que seria usado para uma entidade local.
 *
 *  Contraste didático — imperativo vs. declarativo
 *  ─────────────────────────────────────────────────
 *
 *  ANTES (northwind-client.ts — imperativo):
 *    const url = `${BASE}/Orders?$top=${n}&$expand=Order_Details(...)`
 *    const res = await this.http.get<ODataCollectionResponse<NwOrder>>(url)
 *    return res.value   // desembrulhar manualmente o envelope OData
 *
 *  AGORA (declarativo):
 *    const nw = await cds.connect.to('Northwind')
 *    return await nw.run(
 *        SELECT.from('Northwind.Orders')
 *              .columns('OrderID', 'CustomerID', ...)
 *              .limit(maxOrders)
 *    )
 *    // CAP: gera URL, adiciona $expand, desembrulha value[], trata erros
 *
 *  O que o CAP faz automaticamente:
 *    1. Traduz o CQL para a query string OData correta
 *    2. Adiciona Accept: application/json;odata.metadata=minimal
 *    3. Desembrulha { value: [...] } → retorna o array diretamente
 *    4. Segue $skiptoken para paginação automática (quando necessário)
 *    5. Loga o request/response em DEBUG=cds:remote
 *
 *  Binding configurado em .cdsrc.json > requires.Northwind.
 *  Em produção BTP: trocar credentials.url por credentials.destination
 *  apontando para um SAP Destination Service — sem mudar o código.
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'
import type { NwOrder, NwProduct } from './types'

const LOG = cds.log('northwind-remote-client')

// Lazy singleton — conecta uma vez e reutiliza
let _svc: cds.Service | null = null

async function getNorthwindService(): Promise<cds.Service> {
    if (!_svc) {
        _svc = await cds.connect.to('Northwind')
        LOG.info('Connected to Northwind Remote Service')
    }
    return _svc
}


// ══════════════════════════════════════════════════════════════════
//  fetchOrders — lê Orders + Order_Details via CQL declarativo
// ══════════════════════════════════════════════════════════════════

/**
 * Busca pedidos do Northwind com seus itens expandidos.
 *
 * CQL equivalente ao OData:
 *   GET /Orders?$top=N
 *       &$select=OrderID,CustomerID,OrderDate,Freight
 *       &$expand=to_Details($select=ProductID,UnitPrice,Quantity,Discount)
 *       &$orderby=OrderID asc
 *
 * @param maxOrders  Número máximo de pedidos (default: 5)
 */
export async function fetchNorthwindOrders(maxOrders = 5): Promise<NwOrder[]> {
    const nw = await getNorthwindService()

    // SELECT com path expression — o CAP traduz para $expand automaticamente
    const rows = await nw.run(
        SELECT
            .from('Northwind.Orders')
            .columns(
                'OrderID',
                'CustomerID',
                'OrderDate',
                'Freight',
                // path expression → $expand=to_Details($select=...)
                'to_Details.ProductID',
                'to_Details.UnitPrice',
                'to_Details.Quantity',
                'to_Details.Discount'
            )
            .orderBy('OrderID asc')
            .limit(maxOrders)
    )

    LOG.debug(`fetchNorthwindOrders: fetched ${rows.length} orders`)
    return rows as NwOrder[]
}


// ══════════════════════════════════════════════════════════════════
//  fetchProducts — lê Products via CQL declarativo
// ══════════════════════════════════════════════════════════════════

/**
 * Busca produtos do Northwind.
 *
 * CQL equivalente ao OData:
 *   GET /Products?$top=N&$select=ProductID,ProductName,UnitPrice,...
 *
 * @param maxProducts  Número máximo de produtos (default: 20)
 */
export async function fetchNorthwindProducts(maxProducts = 20): Promise<NwProduct[]> {
    const nw = await getNorthwindService()

    const rows = await nw.run(
        SELECT
            .from('Northwind.Products')
            .columns(
                'ProductID',
                'ProductName',
                'UnitPrice',
                'UnitsInStock',
                'Discontinued'
            )
            .where({ Discontinued: false })
            .orderBy('ProductID asc')
            .limit(maxProducts)
    )

    LOG.debug(`fetchNorthwindProducts: fetched ${rows.length} products`)
    return rows as NwProduct[]
}


// ══════════════════════════════════════════════════════════════════
//  fetchCustomer — lê um único Customer por ID
// ══════════════════════════════════════════════════════════════════

/**
 * Resolve um CustomerID do Northwind para nome da empresa.
 * Demonstra SELECT.one via Remote Service — mesmo padrão de uma
 * entidade local.
 */
export async function fetchNorthwindCustomer(
    customerID: string
): Promise<{ CustomerID: string; CompanyName: string } | undefined> {
    const nw = await getNorthwindService()

    const row = await nw.run(
        SELECT.one
            .from('Northwind.Customers')
            .columns('CustomerID', 'CompanyName')
            .where({ CustomerID: customerID })
    )

    return row as { CustomerID: string; CompanyName: string } | undefined
}
