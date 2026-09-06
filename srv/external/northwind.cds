/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/external/northwind.cds
 *  LAYER : External Service Definition
 *
 *  Propósito
 *  ─────────
 *  Declara o serviço Northwind OData v4 como um Remote Service CAP.
 *  Com esta definição, o handler pode usar CQL idêntico ao de qualquer
 *  entidade local — o CAP traduz automaticamente para HTTP OData.
 *
 *  @cds.external: true
 *    Marca o serviço como externo: o CAP não cria tabelas HANA para
 *    estas entidades — elas são apenas um "tipo" para o compilador.
 *
 *  Contraste com a abordagem anterior (NorthwindClient manual)
 *  ────────────────────────────────────────────────────────────
 *  Antes:
 *    const url = `${NORTHWIND_BASE}/Orders?$top=${n}&$expand=Order_Details`
 *    const response = await this.http.get<ODataCollectionResponse<NwOrder>>(url)
 *    const orders = response.value  // desembrulhar manualmente
 *
 *  Agora (Remote Service declarativo):
 *    const nw = await cds.connect.to('Northwind')
 *    const orders = await nw.run(
 *        SELECT.from('Northwind.Orders')
 *              .columns('OrderID','CustomerID','to_Details.ProductID')
 *              .limit(maxOrders)
 *    )
 *    // CAP gera a URL OData, desembrulha value[], expande associações
 *
 *  O que observar com DEBUG=cds:remote (ou cds:odata):
 *    [cds:remote] → GET https://services.odata.org/.../Orders
 *                       ?$top=5&$expand=Order_Details
 *                       &$select=OrderID,CustomerID,...
 *    [cds:remote] ← 200 OK  (N records)
 *
 *  Binding em .cdsrc.json (seção "requires"):
 *    "Northwind": {
 *      "kind": "odata-v4",
 *      "credentials": {
 *        "url": "https://services.odata.org/V4/Northwind/Northwind.svc"
 *      }
 *    }
 *  Em produção no BTP, o binding aponta para um Destination Service.
 * ═══════════════════════════════════════════════════════════════════
 */

@cds.external: true
service Northwind {

    // ── Orders (VBAK equivalent) ──────────────────────────────────
    entity Orders {
        key OrderID        : Integer;
            CustomerID     : String(5);
            EmployeeID     : Integer;
            OrderDate      : DateTime;
            RequiredDate   : DateTime;
            ShippedDate    : DateTime;
            ShipVia        : Integer;
            Freight        : Decimal(10, 2);
            ShipName       : String(40);
            ShipAddress    : String(60);
            ShipCity       : String(15);
            ShipRegion     : String(15);
            ShipPostalCode : String(10);
            ShipCountry    : String(15);

            // Navigation to line items (OData $expand=Order_Details)
            to_Details     : Association to many Order_Details
                                 on to_Details.OrderID = OrderID;
    }

    // ── Order Details (VBAP equivalent) ──────────────────────────
    entity Order_Details {
        key OrderID   : Integer;
        key ProductID : Integer;
            UnitPrice : Decimal(10, 2);
            Quantity  : Integer;
            Discount  : Decimal(4, 3);

            // Back-navigation
            to_Order   : Association to one Orders
                             on to_Order.OrderID = OrderID;
            to_Product : Association to one Products
                             on to_Product.ProductID = ProductID;
    }

    // ── Products (MARA equivalent) ────────────────────────────────
    entity Products {
        key ProductID       : Integer;
            ProductName     : String(40);
            SupplierID      : Integer;
            CategoryID      : Integer;
            QuantityPerUnit : String(20);
            UnitPrice       : Decimal(10, 2);
            UnitsInStock    : Integer;
            UnitsOnOrder    : Integer;
            ReorderLevel    : Integer;
            Discontinued    : Boolean;
    }

    // ── Customers (KNA1 equivalent) ───────────────────────────────
    entity Customers {
        key CustomerID   : String(5);
            CompanyName  : String(40);
            ContactName  : String(30);
            ContactTitle : String(30);
            Address      : String(60);
            City         : String(15);
            Region       : String(15);
            PostalCode   : String(10);
            Country      : String(15);
            Phone        : String(24);
            Fax          : String(24);
    }
}
