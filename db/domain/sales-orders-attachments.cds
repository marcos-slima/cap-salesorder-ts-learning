/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : db/domain/sales-orders-attachments.cds
 *  LAYER : Domain Extension — @cap-js/attachments
 *
 *  PRÉ-REQUISITO
 *  ─────────────
 *  Este arquivo só compila após instalar o plugin:
 *
 *    npm install @cap-js/attachments
 *
 *  Enquanto o pacote não estiver instalado, o compilador CDS emite:
 *    "Can't find package module '@cap-js/attachments'"
 *  Isso NÃO quebra o restante do projeto — este arquivo é isolado.
 *
 *  Como funciona
 *  ─────────────
 *  O plugin @cap-js/attachments fornece o aspect `Attachments`, que
 *  é uma Composition de uma entidade interna gerenciada pelo plugin.
 *  Ao adicionar `attachments : Composition of many Attachments` em
 *  qualquer entidade raiz, o plugin cuida de:
 *    • Criar a tabela de metadados (filename, mimeType, size, url)
 *    • Expor endpoints OData Stream (PUT/GET /content)
 *    • Armazenar binários localmente em dev (.attachments/ na raiz)
 *    • Usar SAP Object Store em produção BTP (binding automático)
 *
 *  O que observar no $metadata após npm install + cds watch:
 *    • Entidade "Attachments" com propriedade content: Edm.Stream
 *    • PUT /api/orders/SalesOrders('<id>')/attachments('<file>')/content
 *      → aceita o binário (PDF, XLSX, etc.)
 *    • GET /api/orders/SalesOrders('<id>')/attachments
 *      → lista metadados (sem o binário)
 *    • GET /api/orders/SalesOrders('<id>')/attachments('<file>')/content
 *      → faz download do binário
 *
 *  No Fiori Preview:
 *    O Object Page de SalesOrders ganha automaticamente uma aba
 *    "Attachments" com componente de upload/download — gerado pelo
 *    plugin sem nenhuma anotação @UI adicional.
 *
 *  Casos de uso no domínio Sales Orders:
 *    • Nota fiscal PDF enviada pelo cliente
 *    • Contrato de venda assinado (ZCON)
 *    • Comprovante de entrega (Proof of Delivery)
 *    • Planilha de cotação do cliente
 *
 *  Diferença entre storage backends:
 *    dev  → arquivos em .attachments/<entity>/<ID>/<filename>
 *    BTP  → SAP Object Store Service (binding via mta.yaml)
 *           ou SAP Document Management Service (DMS)
 *
 *  Para ativar após npm install:
 *    1. O arquivo já está em db/domain/ — o CDS o compila automaticamente
 *    2. Execute `cds watch` — a tabela Attachments aparece no SQLite
 *    3. Verifique no $metadata: GET http://localhost:4004/api/orders/$metadata
 *    4. Teste upload:
 *         curl -u bob:bob -X PUT \
 *           "http://localhost:4004/api/orders/SalesOrders('<ID>')/attachments" \
 *           -H "Content-Type: application/pdf" \
 *           -H "slug: invoice.pdf" \
 *           --data-binary @invoice.pdf
 * ═══════════════════════════════════════════════════════════════════
 */

using { com.my.sales.SalesOrders } from './sales-orders';
using { Attachments }               from '@cap-js/attachments';

// extend — adiciona a Composition ao agregado raiz existente.
// Padrão CAP: extensões de comportamento ficam em arquivos separados
// para que o modelo principal (sales-orders.cds) permaneça estável.
extend entity SalesOrders with {
    /**
     * Anexos do pedido — notas fiscais, contratos, PoDs.
     *
     * Tipo: Composition of many Attachments
     *   → ciclo de vida atrelado ao pedido (deletado com ele)
     *   → gerenciado inteiramente pelo plugin @cap-js/attachments
     *
     * Limit recomendado em produção: configurar via Object Store policy
     * (ex.: máx 10 MB por arquivo, máx 20 arquivos por pedido).
     */
    attachments : Composition of many Attachments;
}
