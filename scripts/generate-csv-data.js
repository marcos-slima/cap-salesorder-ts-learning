#!/usr/bin/env node

/**
 * Script para gerar massa de dados em arquivos CSV baseado no modelo da aplicação
 * Gera dados coerentes para todas as tabelas: code lists, master data e transações
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// ============================================================================
// UTILIDADES
// ============================================================================

function generateId() {
  return randomUUID();
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function writeCsv(filename, headers, rows) {
  const dir = path.join(__dirname, '../db/data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const csvPath = path.join(dir, filename);
  const content = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    )
  ].join('\n');

  fs.writeFileSync(csvPath, content, 'utf-8');
  console.log(`✓ ${filename} (${rows.length} rows)`);
}

function nowDate() {
  return formatDate(new Date());
}

// ============================================================================
// GERAR DADOS BASE
// ============================================================================

function generateCurrencies() {
  const headers = ['code', 'symbol', 'minorUnit', 'name', 'descr'];
  const rows = [
    { code: 'USD', symbol: '$', minorUnit: 2, name: 'US Dollar', descr: 'United States Dollar' },
    { code: 'EUR', symbol: '€', minorUnit: 2, name: 'Euro', descr: 'Euro' },
    { code: 'GBP', symbol: '£', minorUnit: 2, name: 'British Pound', descr: 'British Pound Sterling' },
    { code: 'JPY', symbol: '¥', minorUnit: 0, name: 'Japanese Yen', descr: 'Japanese Yen' },
    { code: 'BRL', symbol: 'R$', minorUnit: 2, name: 'Brazilian Real', descr: 'Brazilian Real' },
  ];
  writeCsv('sap.common-Currencies.csv', headers, rows);
}

function generateCountries() {
  const headers = ['code', 'name', 'descr'];
  const rows = [
    { code: 'US', name: 'United States', descr: 'United States of America' },
    { code: 'DE', name: 'Germany', descr: 'Germany' },
    { code: 'BR', name: 'Brazil', descr: 'Brazil' },
    { code: 'JP', name: 'Japan', descr: 'Japan' },
    { code: 'GB', name: 'United Kingdom', descr: 'United Kingdom' },
    { code: 'FR', name: 'France', descr: 'France' },
    { code: 'IN', name: 'India', descr: 'India' },
  ];
  writeCsv('sap.common-Countries.csv', headers, rows);
}

function generateLanguages() {
  const headers = ['code', 'name', 'descr'];
  const rows = [
    { code: 'en', name: 'English', descr: 'English' },
    { code: 'de', name: 'German', descr: 'German' },
    { code: 'pt', name: 'Portuguese', descr: 'Portuguese' },
    { code: 'ja', name: 'Japanese', descr: 'Japanese' },
    { code: 'fr', name: 'French', descr: 'French' },
  ];
  writeCsv('sap.common-Languages.csv', headers, rows);
}

function generateSalesOrderTypes() {
  const headers = ['code', 'name', 'descr'];
  const rows = [
    { code: 'OR', name: 'Standard Order', descr: 'Standard sales order' },
    { code: 'ZO', name: 'Zero-price Order', descr: 'Order with zero value' },
    { code: 'KO', name: 'Consignment Order', descr: 'Consignment sales order' },
    { code: 'QT', name: 'Quote', descr: 'Sales quotation' },
  ];
  writeCsv('com.my.sales-SalesOrderTypes.csv', headers, rows);
}

function generateDistributionChannels() {
  const headers = ['code', 'name', 'descr'];
  const rows = [
    { code: '10', name: 'Direct Sales', descr: 'Direct sales to customers' },
    { code: '20', name: 'Wholesale', descr: 'Wholesale distribution' },
    { code: '30', name: 'Online', descr: 'Online sales channel' },
  ];
  writeCsv('com.my.sales-DistributionChannels.csv', headers, rows);
}

function generateDivisions() {
  const headers = ['code', 'name', 'descr'];
  const rows = [
    { code: '00', name: 'All Divisions', descr: 'All divisions' },
    { code: '01', name: 'Pharmaceuticals', descr: 'Pharmaceutical products' },
    { code: '02', name: 'Electronics', descr: 'Electronic products' },
  ];
  writeCsv('com.my.sales-Divisions.csv', headers, rows);
}

function generateScheduleLineCategories() {
  const headers = ['code', 'name', 'descr'];
  const rows = [
    { code: 'CP', name: 'Standard Order', descr: 'Standard order line' },
    { code: 'CN', name: 'Make-to-Order', descr: 'Make-to-order line' },
    { code: 'CS', name: 'Third Party', descr: 'Third party order line' },
  ];
  writeCsv('com.my.sales-ScheduleLineCategories.csv', headers, rows);
}

function generateConditionTypes() {
  const headers = ['code', 'name', 'descr', 'calculationType', 'statisticalFlag'];
  const rows = [
    { code: 'PR00', name: 'Price', descr: 'Base price', calculationType: 'A', statisticalFlag: false },
    { code: 'K007', name: 'Discount', descr: 'Volume discount', calculationType: 'A', statisticalFlag: false },
    { code: 'MWST', name: 'Tax', descr: 'Sales tax', calculationType: 'A', statisticalFlag: true },
    { code: 'ZWKS', name: 'Freight', descr: 'Shipping cost', calculationType: 'C', statisticalFlag: false },
  ];
  writeCsv('com.my.sales-ConditionTypes.csv', headers, rows);
}

function generateProductTypes() {
  const headers = ['code', 'name', 'descr'];
  const rows = [
    { code: 'FERT', name: 'Finished Good', descr: 'Finished product' },
    { code: 'HALBF', name: 'Semi-finished', descr: 'Semi-finished product' },
    { code: 'ROH', name: 'Raw Material', descr: 'Raw material' },
  ];
  writeCsv('com.my.sales-ProductTypes.csv', headers, rows);
}

// ============================================================================
// GERAR DADOS DE ORGANIZAÇÃO
// ============================================================================

function generateSalesOrganizations() {
  const headers = ['ID', 'code', 'name', 'country_code', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];
  const countries = ['US', 'DE', 'BR'];
  const rows = countries.map((country, idx) => ({
    ID: generateId(),
    code: `ORG${country}`,
    name: `Sales Organization ${country}`,
    country_code: country,
    createdAt: formatDate(new Date('2025-01-01')),
    createdBy: 'admin',
    modifiedAt: formatDate(new Date('2025-01-01')),
    modifiedBy: 'admin',
  }));
  writeCsv('com.my.sales-SalesOrganizations.csv', headers, rows);
  return rows;
}

function generateSalesAreas(salesOrganizations) {
  const headers = ['ID', 'salesOrganization_ID', 'distributionChannel_code', 'division_code', 'name', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];
  const distChannels = ['10', '20', '30'];
  const divisions = ['00', '01', '02'];

  const rows = [];
  for (const org of salesOrganizations) {
    for (const channel of distChannels) {
      for (const division of divisions) {
        rows.push({
          ID: generateId(),
          salesOrganization_ID: org.ID,
          distributionChannel_code: channel,
          division_code: division,
          name: `Sales Area ${org.code}-${channel}-${division}`,
          createdAt: formatDate(new Date('2025-01-01')),
          createdBy: 'admin',
          modifiedAt: formatDate(new Date('2025-01-01')),
          modifiedBy: 'admin',
        });
      }
    }
  }
  writeCsv('com.my.sales-SalesAreas.csv', headers, rows);
  return rows;
}

// ============================================================================
// GERAR MASTER DATA
// ============================================================================

function generateBusinessPartners() {
  const headers = ['ID', 'code', 'name', 'name2', 'country_code', 'language_code', 'taxNumber1', 'blocked', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];
  const companies = [
    { name: 'Acme Corporation', country: 'US', lang: 'en' },
    { name: 'Deutsche Industrie', country: 'DE', lang: 'de' },
    { name: 'Brasil Trading', country: 'BR', lang: 'pt' },
    { name: 'Tech Solutions', country: 'US', lang: 'en' },
    { name: 'Global Parts', country: 'GB', lang: 'en' },
    { name: 'Nippon Manufacturing', country: 'JP', lang: 'ja' },
  ];

  const rows = companies.map((company, idx) => ({
    ID: generateId(),
    code: String(1000000000 + idx).slice(0, 10),
    name: company.name,
    name2: `Branch ${idx + 1}`,
    country_code: company.country,
    language_code: company.lang,
    taxNumber1: `TAX${idx + 1000}`,
    blocked: false,
    createdAt: formatDate(new Date('2025-01-01')),
    createdBy: 'admin',
    modifiedAt: formatDate(new Date('2025-01-01')),
    modifiedBy: 'admin',
  }));
  writeCsv('com.my.sales-BusinessPartners.csv', headers, rows);
  return rows;
}

function generateBusinessPartnerAddresses(partners) {
  const headers = ['ID', 'partner_ID', 'addressType', 'street', 'city', 'postalCode', 'country_code', 'isDefault', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];
  const partnerByCode = Object.fromEntries(partners.map(p => [p.code, p]));
  const addresses_data = [
    { partnerCode: '1000000000', city: 'New York', street: '123 Main St', postal: '10001', country: 'US', type: 'DEFAULT' },
    { partnerCode: '1000000001', city: 'Berlin', street: 'Hauptstr. 45', postal: '10115', country: 'DE', type: 'BILL' },
    { partnerCode: '1000000002', city: 'São Paulo', street: 'Av. Paulista 1000', postal: '01311-100', country: 'BR', type: 'SHIP' },
    { partnerCode: '1000000003', city: 'San Francisco', street: '321 Tech Way', postal: '94105', country: 'US', type: 'BILL' },
    { partnerCode: '1000000004', city: 'London', street: '50 Bond Street', postal: 'W1A 1AA', country: 'GB', type: 'DEFAULT' },
    { partnerCode: '1000000005', city: 'Tokyo', street: '2-1-1 Marunouchi', postal: '100-0005', country: 'JP', type: 'SHIP' },
  ];

  const rows = addresses_data.map((addr, idx) => ({
    ID: generateId(),
    partner_ID: partnerByCode[addr.partnerCode].ID,
    addressType: addr.type,
    street: addr.street,
    city: addr.city,
    postalCode: addr.postal,
    country_code: addr.country,
    isDefault: addr.type === 'DEFAULT' ? 'true' : 'false',
    createdAt: formatDate(new Date('2025-01-01')),
    createdBy: 'admin',
    modifiedAt: formatDate(new Date('2025-01-01')),
    modifiedBy: 'admin',
  }));
  writeCsv('com.my.sales-BusinessPartnerAddresses.csv', headers, rows);
  return rows;
}

function generateProducts() {
  const headers = ['ID', 'code', 'name', 'description', 'type_code', 'baseUnit', 'authorizationGroup', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];
  const products_data = [
    { code: 'ELE-001', name: 'Laptop Pro 15"', desc: 'High-performance laptop', type: 'FERT', unit: 'PC' },
    { code: 'ELE-002', name: 'USB-C Hub', desc: '7-in-1 USB hub', type: 'FERT', unit: 'PC' },
    { code: 'ELE-003', name: 'Wireless Mouse', desc: 'Ergonomic wireless mouse', type: 'FERT', unit: 'PC' },
    { code: 'RAW-001', name: 'Copper Wire', desc: 'Electrical copper wire', type: 'ROH', unit: 'KG' },
    { code: 'RAW-002', name: 'Plastic Resin', desc: 'ABS plastic resin', type: 'ROH', unit: 'KG' },
    { code: 'SEM-001', name: 'PCB Assembly', desc: 'Printed circuit board', type: 'HALBF', unit: 'PC' },
  ];

  const rows = products_data.map((prod, idx) => ({
    ID: generateId(),
    code: prod.code,
    name: prod.name,
    description: prod.desc,
    type_code: prod.type,
    baseUnit: prod.unit,
    authorizationGroup: 'PROD',
    createdAt: formatDate(new Date('2025-01-01')),
    createdBy: 'admin',
    modifiedAt: formatDate(new Date('2025-01-01')),
    modifiedBy: 'admin',
  }));
  writeCsv('com.my.sales-Products.csv', headers, rows);
  return rows;
}

function generateProductPrices(products) {
  const headers = ['product_ID', 'priceType', 'validFrom', 'validTo', 'amount', 'currency_code', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];
  const prices = {
    'ELE-001': 1200,
    'ELE-002': 89,
    'ELE-003': 45,
    'RAW-001': 12,
    'RAW-002': 8,
    'SEM-001': 150,
  };

  // ProductPrices key is (product_ID, priceType, validFrom).
  // Keep one active LIST price per product to avoid PK collisions.
  const rows = products.map((product) => ({
    product_ID: product.ID,
    priceType: 'LIST',
    validFrom: '2025-01-01',
    validTo: '',
    amount: prices[product.code].toFixed(2),
    currency_code: 'USD',
    createdAt: formatDate(new Date('2025-01-01')),
    createdBy: 'admin',
    modifiedAt: formatDate(new Date('2025-01-01')),
    modifiedBy: 'admin',
  }));

  writeCsv('com.my.sales-ProductPrices.csv', headers, rows);
  return rows;
}

// ============================================================================
// GERAR DADOS TRANSACIONAIS
// ============================================================================

function generateSalesOrders(salesAreas) {
  const headers = ['ID', 'salesOrder', 'salesOrderType_code', 'salesArea_ID', 'orderDate', 'requestedDelivDate', 'pricingDate', 'netAmount', 'transactionCurrency_code', 'purchaseOrderNumber', 'purchaseOrderDate', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy', 'deletionIndicator', 'overallStatus', 'deliveryStatus', 'billingStatus', 'lastEventType', 'lastEventAt'];

  const rows = [];
  for (let i = 0; i < 15; i++) {
    const orderDate = new Date(2025, Math.floor(Math.random() * 3), Math.floor(Math.random() * 28) + 1);
    const delivDate = new Date(orderDate);
    delivDate.setDate(delivDate.getDate() + Math.floor(Math.random() * 30) + 7);

    rows.push({
      ID: generateId(),
      salesOrder: String(1000000000 + i).slice(0, 10),
      salesOrderType_code: randomItem(['OR', 'ZO', 'KO']),
      salesArea_ID: randomItem(salesAreas).ID,
      orderDate: formatDate(orderDate),
      requestedDelivDate: formatDate(delivDate),
      pricingDate: formatDate(orderDate),
      netAmount: '0.00',
      transactionCurrency_code: randomItem(['USD', 'EUR', 'BRL']),
      purchaseOrderNumber: `PO-${1000000 + i}`,
      purchaseOrderDate: formatDate(orderDate),
      createdAt: nowDate(),
      createdBy: 'admin',
      modifiedAt: nowDate(),
      modifiedBy: 'admin',
      deletionIndicator: ' ',
      overallStatus: randomItem(['A', 'B', 'C']),
      deliveryStatus: randomItem(['A', 'B', 'C']),
      billingStatus: randomItem(['A', 'B', 'C']),
      lastEventType: 'created',
      lastEventAt: nowDate(),
    });
  }
  writeCsv('com.my.sales-SalesOrders.csv', headers, rows);
  return rows;
}

function generateSalesOrderItems(orders, products) {
  const headers = ['ID', 'order_ID', 'itemNumber', 'product_ID', 'orderQuantity', 'orderQuantityUnit', 'netAmount', 'transactionCurrency_code', 'higherLevelItem_ID', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy', 'deletionIndicator'];

  const units = {
    'ELE-001': 'PC', 'ELE-002': 'PC', 'ELE-003': 'PC',
    'RAW-001': 'KG', 'RAW-002': 'KG', 'SEM-001': 'PC'
  };

  const rows = [];
  const orderTotals = {};

  for (const order of orders) {
    const itemCount = Math.floor(Math.random() * 4) + 1;
    for (let itemIdx = 0; itemIdx < itemCount; itemIdx++) {
      const product = randomItem(products);
      const quantity = Math.floor(Math.random() * 100) + 1;
      const itemNet = Number((quantity * (Math.random() * 1000)).toFixed(2));
      rows.push({
        ID: generateId(),
        order_ID: order.ID,
        itemNumber: (itemIdx + 1) * 10,
        product_ID: product.ID,
        orderQuantity: quantity,
        orderQuantityUnit: units[product.code],
        netAmount: itemNet.toFixed(2),
        transactionCurrency_code: order.transactionCurrency_code,
        higherLevelItem_ID: '',
        createdAt: nowDate(),
        createdBy: 'admin',
        modifiedAt: nowDate(),
        modifiedBy: 'admin',
        deletionIndicator: ' ',
      });

      orderTotals[order.ID] = (orderTotals[order.ID] || 0) + itemNet;
    }
  }
  writeCsv('com.my.sales-SalesOrderItems.csv', headers, rows);
  return { rows, orderTotals };
}

function generateSalesOrderItemConditions(items) {
  const headers = ['item_ID', 'conditionStep', 'conditionType_code', 'conditionRate', 'conditionCurrency_code', 'conditionValue', 'conditionBase', 'conditionQuantityUnit', 'calculationType', 'statisticalFlag'];

  const rows = [];
  for (const item of items) {
    rows.push({
      item_ID: item.ID,
      conditionStep: 1,
      conditionType_code: 'PR00',
      conditionRate: '100.00',
      conditionCurrency_code: item.transactionCurrency_code,
      conditionValue: item.netAmount,
      conditionBase: item.orderQuantity,
      conditionQuantityUnit: item.orderQuantityUnit,
      calculationType: 'A',
      statisticalFlag: false,
    });
  }
  writeCsv('com.my.sales-SalesOrderItemConditions.csv', headers, rows);
  return rows;
}

function generateSalesOrderScheduleLines(items) {
  const headers = ['item_ID', 'scheduleLineNo', 'deliveryDate', 'confirmedQty', 'requestedQty', 'quantityUnit', 'scheduleLineCategory_code', 'mrpElement', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];

  const rows = [];
  let idx = 0;
  for (const item of items) {
    const delivDate = new Date();
    delivDate.setDate(delivDate.getDate() + Math.floor(Math.random() * 60) + 1);
    const qty = Math.max(1, Math.floor(Number(item.orderQuantity) * 0.7));

    rows.push({
      item_ID: item.ID,
      scheduleLineNo: 1,
      deliveryDate: formatDate(delivDate),
      confirmedQty: qty,
      requestedQty: Number(item.orderQuantity),
      quantityUnit: item.orderQuantityUnit,
      scheduleLineCategory_code: randomItem(['CP', 'CN', 'CS']),
      mrpElement: `MRP-${1000000 + idx}`,
      createdAt: nowDate(),
      createdBy: 'admin',
      modifiedAt: nowDate(),
      modifiedBy: 'admin',
    });
    idx += 1;
  }
  writeCsv('com.my.sales-SalesOrderScheduleLines.csv', headers, rows);
  return rows;
}

function generateSalesOrderPartners(orders, partners, addresses) {
  const headers = ['order_ID', 'role', 'partner_ID', 'address_ID', 'partnerName', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];
  const roles = ['AG', 'WE', 'RE'];

  const rows = [];
  for (const order of orders) {
    for (const role of roles) {
      const partner = randomItem(partners);
      const partnerAddresses = addresses.filter(a => a.partner_ID === partner.ID);
      const address = partnerAddresses.length ? randomItem(partnerAddresses) : '';
      rows.push({
        order_ID: order.ID,
        role,
        partner_ID: partner.ID,
        address_ID: address ? address.ID : '',
        partnerName: partner.name,
        createdAt: nowDate(),
        createdBy: 'admin',
        modifiedAt: nowDate(),
        modifiedBy: 'admin',
      });
    }
  }
  writeCsv('com.my.sales-SalesOrderPartners.csv', headers, rows);
  return rows;
}

function generateSalesOrderHeaderTexts(orders) {
  const headers = ['order_ID', 'textId', 'language', 'text', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];

  const notes = [
    'Standard terms apply',
    'Special packaging required',
    'Rush delivery requested',
    'Customer approved design',
    'Payment terms: Net 30',
  ];

  const rows = [];
  for (const order of orders) {
    if (Math.random() > 0.5) {
      rows.push({
        order_ID: order.ID,
        textId: 'ZINT',
        language: 'en',
        text: randomItem(notes),
        createdAt: nowDate(),
        createdBy: 'admin',
        modifiedAt: nowDate(),
        modifiedBy: 'admin',
      });
    }
  }
  writeCsv('com.my.sales-SalesOrderHeaderTexts.csv', headers, rows);
  return rows;
}

function generateSalesOrderItemTexts(items) {
  const headers = ['item_ID', 'textId', 'language', 'text', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];

  const itemNotes = [
    'High priority item',
    'Expedited delivery needed',
    'Special quality inspection',
  ];

  const rows = [];
  for (const item of items) {
    if (Math.random() > 0.7) {
      rows.push({
        item_ID: item.ID,
        textId: 'ZPOS',
        language: 'en',
        text: randomItem(itemNotes),
        createdAt: nowDate(),
        createdBy: 'admin',
        modifiedAt: nowDate(),
        modifiedBy: 'admin',
      });
    }
  }
  writeCsv('com.my.sales-SalesOrderItemTexts.csv', headers, rows);
  return rows;
}

function updateSalesOrderNetAmounts(orders, orderTotals) {
  const headers = ['ID', 'salesOrder', 'salesOrderType_code', 'salesArea_ID', 'orderDate', 'requestedDelivDate', 'pricingDate', 'netAmount', 'transactionCurrency_code', 'purchaseOrderNumber', 'purchaseOrderDate', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy', 'deletionIndicator', 'overallStatus', 'deliveryStatus', 'billingStatus', 'lastEventType', 'lastEventAt'];

  for (const order of orders) {
    order.netAmount = (orderTotals[order.ID] || 0).toFixed(2);
  }

  writeCsv('com.my.sales-SalesOrders.csv', headers, orders);
}

// ============================================================================
// GERAR DADOS DE INTEGRACAO (SHADOW ENTITIES)
// ============================================================================

function generateImportRuns() {
  const headers = ['ID', 'source', 'startedAt', 'completedAt', 'status', 'recordsImported', 'errorMessage', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];
  const startedAt = `${nowDate()}T08:00:00`;
  const completedAt = `${nowDate()}T08:01:10`;

  const rows = [
    {
      ID: generateId(),
      source: 'northwind-odata',
      startedAt,
      completedAt,
      status: 'completed',
      recordsImported: 18,
      errorMessage: '',
      createdAt: nowDate(),
      createdBy: 'integration-user',
      modifiedAt: nowDate(),
      modifiedBy: 'integration-user',
    },
    {
      ID: generateId(),
      source: 'dummyjson-rest',
      startedAt,
      completedAt,
      status: 'completed',
      recordsImported: 6,
      errorMessage: '',
      createdAt: nowDate(),
      createdBy: 'integration-user',
      modifiedAt: nowDate(),
      modifiedBy: 'integration-user',
    },
  ];

  writeCsv('com.my.sales.integration-ImportRuns.csv', headers, rows);
  return rows;
}

function generateNorthwindProducts(importRunId, localProducts) {
  const headers = ['northwindProductID', 'productName', 'supplierID', 'categoryID', 'quantityPerUnit', 'unitPrice', 'unitsInStock', 'unitsOnOrder', 'discontinued', 'importRun_ID', 'localProductCode', 'localProduct_ID', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];

  const rows = localProducts.slice(0, 4).map((product, idx) => ({
    northwindProductID: idx + 1,
    productName: `NW ${product.name}`,
    supplierID: 100 + idx,
    categoryID: 10 + idx,
    quantityPerUnit: '1 unit',
    unitPrice: (40 + (idx * 20)).toFixed(2),
    unitsInStock: 25 + (idx * 5),
    unitsOnOrder: idx,
    discontinued: false,
    importRun_ID: importRunId,
    localProductCode: product.code,
    localProduct_ID: product.ID,
    createdAt: nowDate(),
    createdBy: 'integration-user',
    modifiedAt: nowDate(),
    modifiedBy: 'integration-user',
  }));

  writeCsv('com.my.sales.integration-NorthwindProducts.csv', headers, rows);
  return rows;
}

function generateNorthwindOrders(importRunId, localOrders) {
  const headers = ['northwindOrderID', 'customerID', 'employeeID', 'orderDate', 'requiredDate', 'shippedDate', 'freight', 'shipName', 'shipAddress', 'shipCity', 'shipRegion', 'shipPostalCode', 'shipCountry', 'freightConverted', 'convertedCurrency', 'conversionRate', 'importRun_ID', 'localOrder_ID', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];

  const rows = localOrders.slice(0, 6).map((order, idx) => ({
    northwindOrderID: 11000 + idx,
    customerID: `C${String(idx + 1).padStart(4, '0')}`,
    employeeID: 10 + idx,
    orderDate: `${order.orderDate}T10:00:00`,
    requiredDate: `${order.requestedDelivDate}T10:00:00`,
    shippedDate: '',
    freight: (10 + (idx * 1.5)).toFixed(4),
    shipName: `Ship ${order.salesOrder}`,
    shipAddress: `${200 + idx} Market Street`,
    shipCity: randomItem(['Seattle', 'London', 'Sao Paulo']),
    shipRegion: '',
    shipPostalCode: `10${idx}00`,
    shipCountry: randomItem(['USA', 'Germany', 'Brazil']),
    freightConverted: ((10 + (idx * 1.5)) * 0.92).toFixed(4),
    convertedCurrency: 'EUR',
    conversionRate: '0.920000',
    importRun_ID: importRunId,
    localOrder_ID: order.ID,
    createdAt: nowDate(),
    createdBy: 'integration-user',
    modifiedAt: nowDate(),
    modifiedBy: 'integration-user',
  }));

  writeCsv('com.my.sales.integration-NorthwindOrders.csv', headers, rows);
  return rows;
}

function generateNorthwindOrderItems(importRunId, northwindOrders, northwindProducts) {
  const headers = ['northwindOrderID', 'northwindProductID', 'unitPrice', 'quantity', 'discount', 'lineTotal', 'importRun_ID', 'localItem_ID', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];

  const rows = [];
  for (const order of northwindOrders) {
    const product = randomItem(northwindProducts);
    const qty = Math.floor(Math.random() * 15) + 1;
    const unitPrice = Number(product.unitPrice);
    const discount = 0.1;
    const lineTotal = (qty * unitPrice * (1 - discount)).toFixed(4);

    rows.push({
      northwindOrderID: order.northwindOrderID,
      northwindProductID: product.northwindProductID,
      unitPrice: unitPrice.toFixed(4),
      quantity: qty,
      discount: discount.toFixed(4),
      lineTotal,
      importRun_ID: importRunId,
      localItem_ID: '',
      createdAt: nowDate(),
      createdBy: 'integration-user',
      modifiedAt: nowDate(),
      modifiedBy: 'integration-user',
    });
  }

  writeCsv('com.my.sales.integration-NorthwindOrderItems.csv', headers, rows);
  return rows;
}

function generateRestProducts(importRunId, localProducts) {
  const headers = ['externalID', 'title', 'description', 'price', 'discountPct', 'rating', 'stock', 'brand', 'category', 'importRun_ID', 'localProductCode', 'localProduct_ID', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];

  const rows = localProducts.map((product, idx) => ({
    externalID: idx + 9000,
    title: `REST ${product.name}`,
    description: product.description,
    price: (19 + (idx * 13)).toFixed(2),
    discountPct: '0.1200',
    rating: (3.5 + (idx * 0.2)).toFixed(2),
    stock: 40 + (idx * 3),
    brand: randomItem(['Acme', 'Contoso', 'Northwind']),
    category: randomItem(['electronics', 'components', 'office']),
    importRun_ID: importRunId,
    localProductCode: product.code,
    localProduct_ID: product.ID,
    createdAt: nowDate(),
    createdBy: 'integration-user',
    modifiedAt: nowDate(),
    modifiedBy: 'integration-user',
  }));

  writeCsv('com.my.sales.integration-RestProducts.csv', headers, rows);
  return rows;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

console.log('📊 Gerando massa de dados CSV...\n');

// Base data
console.log('📋 Code Lists:');
generateCurrencies();
generateCountries();
generateLanguages();
generateSalesOrderTypes();
generateDistributionChannels();
generateDivisions();
generateScheduleLineCategories();
generateConditionTypes();
generateProductTypes();

// Organization data
console.log('\n🏢 Organizational Structure:');
const salesOrganizations = generateSalesOrganizations();
const salesAreas = generateSalesAreas(salesOrganizations);

// Master data
console.log('\n📦 Master Data:');
const partners = generateBusinessPartners();
const addresses = generateBusinessPartnerAddresses(partners);
const products = generateProducts();
generateProductPrices(products);

// Transactional data
console.log('\n📈 Transactional Data:');
const orders = generateSalesOrders(salesAreas);
const { rows: items, orderTotals } = generateSalesOrderItems(orders, products);
updateSalesOrderNetAmounts(orders, orderTotals);
generateSalesOrderItemConditions(items);
generateSalesOrderScheduleLines(items);
generateSalesOrderPartners(orders, partners, addresses);
generateSalesOrderHeaderTexts(orders);
generateSalesOrderItemTexts(items);

// Integration data
console.log('\n🔌 Integration Shadow Data:');
const importRuns = generateImportRuns();
const northwindProducts = generateNorthwindProducts(importRuns[0].ID, products);
const northwindOrders = generateNorthwindOrders(importRuns[0].ID, orders);
generateNorthwindOrderItems(importRuns[0].ID, northwindOrders, northwindProducts);
generateRestProducts(importRuns[1].ID, products);

console.log('\n✅ Geração concluída com sucesso! 🎉');
