/**
 * CSV data generator aligned with current CDS schema.
 *
 * Important:
 * - By default, files are written to ../legacy-seed so they do not
 *   interfere with normal `cds deploy` in development.
 * - To write directly to db/data, set CSV_OUTPUT_DIR=db/data.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

type Row = Record<string, string | number | boolean | null>;

type GenerationMode = 'safe' | 'deploy-ready';

const MODE = (process.env.CSV_MODE as GenerationMode) || 'safe';
const DEFAULT_OUTPUT_DIR = MODE === 'deploy-ready' ? '../db/data' : '../legacy-seed';
const OUTPUT_DIR = process.env.CSV_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptDir, OUTPUT_DIR);
const CLEAN_BEFORE_WRITE = process.env.CSV_CLEAN === 'true';

const now = new Date('2026-04-12');

function generateId(): string {
  return randomUUID();
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function writeCsv(filename: string, headers: string[], rows: Row[]): void {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const csvPath = path.join(outDir, filename);
  const content = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
  ].join('\n');

  fs.writeFileSync(csvPath, content, 'utf-8');
  console.log(`  - ${filename} (${rows.length} rows)`);
}

function cleanupGeneratedCsvFiles(filenames: string[]): void {
  if (!fs.existsSync(outDir)) return;

  for (const filename of filenames) {
    const filePath = path.join(outDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

const generatedFiles = [
  'com.my.sales-SalesOrderTypes.csv',
  'com.my.sales-DistributionChannels.csv',
  'com.my.sales-Divisions.csv',
  'com.my.sales-ScheduleLineCategories.csv',
  'com.my.sales-ConditionTypes.csv',
  'com.my.sales-ProductTypes.csv',
  'com.my.sales-SalesOrganizations.csv',
  'com.my.sales-SalesAreas.csv',
  'com.my.sales-BusinessPartners.csv',
  'com.my.sales-BusinessPartnerAddresses.csv',
  'com.my.sales-Products.csv',
  'com.my.sales-ProductPrices.csv',
  'com.my.sales-SalesOrders.csv',
  'com.my.sales-SalesOrderItems.csv',
  'com.my.sales-SalesOrderItemConditions.csv',
  'com.my.sales-SalesOrderScheduleLines.csv',
  'com.my.sales-SalesOrderPartners.csv',
  'com.my.sales-SalesOrderHeaderTexts.csv',
  'com.my.sales-SalesOrderItemTexts.csv'
];

const salesOrderTypes = [
  { code: 'OR', name: 'Standard Order', descr: 'Standard sales order' },
  { code: 'ZO', name: 'Zero-price Order', descr: 'Order with zero value' },
  { code: 'KO', name: 'Consignment Order', descr: 'Consignment sales order' },
  { code: 'QT', name: 'Quote', descr: 'Sales quotation' }
];

const distributionChannels = [
  { code: '10', name: 'Direct Sales', descr: 'Direct sales to customers' },
  { code: '20', name: 'Wholesale', descr: 'Wholesale distribution' },
  { code: '30', name: 'Online', descr: 'Online sales channel' }
];

const divisions = [
  { code: '00', name: 'All Divisions', descr: 'All divisions' },
  { code: '01', name: 'Pharmaceuticals', descr: 'Pharmaceutical products' },
  { code: '02', name: 'Electronics', descr: 'Electronic products' }
];

const scheduleLineCategories = [
  { code: 'CP', name: 'Standard Order', descr: 'Standard order line' },
  { code: 'CN', name: 'Make-to-Order', descr: 'Make-to-order line' },
  { code: 'CS', name: 'Third Party', descr: 'Third party order line' }
];

const conditionTypes = [
  { code: 'PR00', name: 'Price', descr: 'Base price', calculationType: 'A', statisticalFlag: false },
  { code: 'K007', name: 'Discount', descr: 'Volume discount', calculationType: 'A', statisticalFlag: false },
  { code: 'MWST', name: 'Tax', descr: 'Sales tax', calculationType: 'A', statisticalFlag: true },
  { code: 'ZWKS', name: 'Freight', descr: 'Shipping cost', calculationType: 'C', statisticalFlag: false }
];

const productTypes = [
  { code: 'FERT', name: 'Finished Good', descr: 'Finished product' },
  { code: 'HALB', name: 'Semi-finished', descr: 'Semi-finished product' },
  { code: 'ROH', name: 'Raw Material', descr: 'Raw material' }
];

const salesOrganizations = ['US', 'DE', 'BR'].map((country) => ({
  ID: generateId(),
  code: `ORG${country}`,
  name: `Sales Organization ${country}`,
  country_code: country,
  createdAt: formatDate(now),
  createdBy: 'admin',
  modifiedAt: formatDate(now),
  modifiedBy: 'admin'
}));

const salesAreas: Row[] = [];
for (const org of salesOrganizations) {
  for (const channel of distributionChannels) {
    for (const division of divisions) {
      salesAreas.push({
        ID: generateId(),
        salesOrganization_ID: org.ID,
        distributionChannel_code: channel.code,
        division_code: division.code,
        name: `Sales Area ${org.code}-${channel.code}-${division.code}`,
        createdAt: formatDate(now),
        createdBy: 'admin',
        modifiedAt: formatDate(now),
        modifiedBy: 'admin'
      });
    }
  }
}

const businessPartners = [
  { name: 'Acme Corporation', country: 'US', language: 'en' },
  { name: 'Deutsche Industrie', country: 'DE', language: 'de' },
  { name: 'Brasil Trading', country: 'BR', language: 'pt' },
  { name: 'Tech Solutions', country: 'US', language: 'en' },
  { name: 'Global Parts', country: 'GB', language: 'en' },
  { name: 'Nippon Manufacturing', country: 'JP', language: 'ja' }
].map((bp, idx) => ({
  ID: generateId(),
  code: String(1000000000 + idx),
  name: bp.name,
  name2: `Branch ${idx + 1}`,
  country_code: bp.country,
  language_code: bp.language,
  taxNumber1: `TAX${1000 + idx}`,
  blocked: false,
  createdAt: formatDate(now),
  createdBy: 'admin',
  modifiedAt: formatDate(now),
  modifiedBy: 'admin'
}));

const businessPartnerAddresses = businessPartners.map((bp, idx) => ({
  ID: generateId(),
  partner_ID: bp.ID,
  addressType: randomItem(['DEFAULT', 'BILL', 'SHIP']),
  street: `${100 + idx} Main Street`,
  city: randomItem(['New York', 'Berlin', 'Sao Paulo', 'San Francisco', 'London', 'Tokyo']),
  postalCode: String(10000 + idx),
  country_code: bp.country_code,
  isDefault: idx % 2 === 0,
  createdAt: formatDate(now),
  createdBy: 'admin',
  modifiedAt: formatDate(now),
  modifiedBy: 'admin'
}));

const products = [
  { code: 'ELE-001', name: 'Laptop Pro 15', description: 'High-performance laptop', type_code: 'FERT', baseUnit: 'PC' },
  { code: 'ELE-002', name: 'USB-C Hub', description: '7-in-1 USB hub', type_code: 'FERT', baseUnit: 'PC' },
  { code: 'ELE-003', name: 'Wireless Mouse', description: 'Ergonomic wireless mouse', type_code: 'FERT', baseUnit: 'PC' },
  { code: 'RAW-001', name: 'Copper Wire', description: 'Electrical copper wire', type_code: 'ROH', baseUnit: 'KG' },
  { code: 'RAW-002', name: 'Plastic Resin', description: 'ABS plastic resin', type_code: 'ROH', baseUnit: 'KG' },
  { code: 'SEM-001', name: 'PCB Assembly', description: 'Printed circuit board', type_code: 'HALB', baseUnit: 'PC' }
].map((p) => ({
  ID: generateId(),
  ...p,
  authorizationGroup: 'PROD',
  createdAt: formatDate(now),
  createdBy: 'admin',
  modifiedAt: formatDate(now),
  modifiedBy: 'admin'
}));

const productPrices: Row[] = [];
const currencyRates: Record<string, number> = { USD: 1, EUR: 0.92, BRL: 5.2 };
const listPrices: Record<string, number> = {
  'ELE-001': 1200,
  'ELE-002': 89,
  'ELE-003': 45,
  'RAW-001': 12,
  'RAW-002': 8,
  'SEM-001': 150
};

for (const p of products) {
  for (const currency of ['USD', 'EUR', 'BRL']) {
    productPrices.push({
      product_ID: p.ID,
      priceType: 'LIST',
      validFrom: '2025-01-01',
      validTo: null,
      amount: Number((listPrices[p.code] * currencyRates[currency]).toFixed(2)),
      currency_code: currency,
      createdAt: formatDate(now),
      createdBy: 'admin',
      modifiedAt: formatDate(now),
      modifiedBy: 'admin'
    });
  }
}

const salesOrders: Row[] = [];
for (let i = 0; i < 15; i++) {
  const orderDate = new Date(2025, randomInt(0, 2), randomInt(1, 28));
  const requestDate = new Date(orderDate);
  requestDate.setDate(requestDate.getDate() + randomInt(7, 30));

  salesOrders.push({
    ID: generateId(),
    salesOrder: String(1000000000 + i),
    salesOrderType_code: randomItem(salesOrderTypes).code,
    salesArea_ID: String(randomItem(salesAreas).ID),
    orderDate: formatDate(orderDate),
    requestedDelivDate: formatDate(requestDate),
    pricingDate: formatDate(orderDate),
    netAmount: Number((Math.random() * 50000 + 1000).toFixed(2)),
    transactionCurrency_code: randomItem(['USD', 'EUR', 'BRL']),
    purchaseOrderNumber: `PO-${1000000 + i}`,
    purchaseOrderDate: formatDate(orderDate),
    createdAt: formatDate(now),
    createdBy: 'admin',
    modifiedAt: formatDate(now),
    modifiedBy: 'admin',
    deletionIndicator: ' ',
    overallStatus: randomItem(['A', 'B', 'C']),
    deliveryStatus: randomItem(['A', 'B', 'C']),
    billingStatus: randomItem(['A', 'B', 'C']),
    lastEventType: 'created',
    lastEventAt: formatDate(now)
  });
}

const salesOrderItems: Row[] = [];
for (const order of salesOrders) {
  const count = randomInt(1, 4);
  for (let itemNo = 1; itemNo <= count; itemNo++) {
    const product = randomItem(products);
    const qty = randomInt(1, 100);
    salesOrderItems.push({
      ID: generateId(),
      order_ID: String(order.ID),
      itemNumber: itemNo * 10,
      product_ID: product.ID,
      orderQuantity: qty,
      orderQuantityUnit: product.baseUnit,
      netAmount: Number((qty * randomInt(50, 400)).toFixed(2)),
      transactionCurrency_code: String(order.transactionCurrency_code),
      higherLevelItem_ID: null,
      createdAt: formatDate(now),
      createdBy: 'admin',
      modifiedAt: formatDate(now),
      modifiedBy: 'admin',
      deletionIndicator: ' '
    });
  }
}

const salesOrderItemConditions: Row[] = salesOrderItems.map((item) => ({
  item_ID: String(item.ID),
  conditionStep: 1,
  conditionType_code: 'PR00',
  conditionRate: 100,
  conditionCurrency_code: randomItem(['USD', 'EUR', 'BRL']),
  conditionValue: Number((Math.random() * 5000).toFixed(2)),
  conditionBase: randomInt(1, 100),
  conditionQuantityUnit: String(item.orderQuantityUnit),
  calculationType: 'A',
  statisticalFlag: false
}));

const salesOrderScheduleLines: Row[] = salesOrderItems.map((item, idx) => {
  const deliveryDate = new Date(now);
  deliveryDate.setDate(deliveryDate.getDate() + randomInt(1, 60));
  const requestedQty = randomInt(5, 100);
  const confirmedQty = Math.max(1, requestedQty - randomInt(0, 10));

  return {
    item_ID: String(item.ID),
    scheduleLineNo: 1,
    deliveryDate: formatDate(deliveryDate),
    confirmedQty,
    requestedQty,
    quantityUnit: String(item.orderQuantityUnit),
    scheduleLineCategory_code: randomItem(scheduleLineCategories).code,
    mrpElement: `MRP-${1000000 + idx}`,
    createdAt: formatDate(now),
    createdBy: 'admin',
    modifiedAt: formatDate(now),
    modifiedBy: 'admin'
  };
});

const salesOrderPartners: Row[] = [];
for (const order of salesOrders) {
  for (const role of ['AG', 'WE', 'RE']) {
    const bp = randomItem(businessPartners);
    const addr = randomItem(businessPartnerAddresses.filter((a) => a.partner_ID === bp.ID));
    salesOrderPartners.push({
      order_ID: String(order.ID),
      role,
      partner_ID: bp.ID,
      address_ID: addr ? addr.ID : null,
      partnerName: bp.name,
      createdAt: formatDate(now),
      createdBy: 'admin',
      modifiedAt: formatDate(now),
      modifiedBy: 'admin'
    });
  }
}

const salesOrderHeaderTexts: Row[] = salesOrders
  .filter(() => Math.random() > 0.4)
  .map((order) => ({
    order_ID: String(order.ID),
    textId: 'ZINT',
    language: 'en',
    text: randomItem([
      'Standard terms apply',
      'Special packaging required',
      'Rush delivery requested',
      'Customer approved design',
      'Payment terms: Net 30'
    ]),
    createdAt: formatDate(now),
    createdBy: 'admin',
    modifiedAt: formatDate(now),
    modifiedBy: 'admin'
  }));

const salesOrderItemTexts: Row[] = salesOrderItems
  .filter(() => Math.random() > 0.7)
  .map((item) => ({
    item_ID: String(item.ID),
    textId: 'ZPOS',
    language: 'en',
    text: randomItem([
      'High priority item',
      'Expedited delivery needed',
      'Special quality inspection'
    ]),
    createdAt: formatDate(now),
    createdBy: 'admin',
    modifiedAt: formatDate(now),
    modifiedBy: 'admin'
  }));

console.log('Generating schema-aligned CSV datasets');
console.log(`Mode: ${MODE}`);
console.log(`Output directory: ${outDir}`);

if (CLEAN_BEFORE_WRITE) {
  cleanupGeneratedCsvFiles(generatedFiles);
  console.log('Existing generated CSV files were cleaned before write.');
}

writeCsv('com.my.sales-SalesOrderTypes.csv', ['code', 'name', 'descr'], salesOrderTypes);
writeCsv('com.my.sales-DistributionChannels.csv', ['code', 'name', 'descr'], distributionChannels);
writeCsv('com.my.sales-Divisions.csv', ['code', 'name', 'descr'], divisions);
writeCsv('com.my.sales-ScheduleLineCategories.csv', ['code', 'name', 'descr'], scheduleLineCategories);
writeCsv('com.my.sales-ConditionTypes.csv', ['code', 'name', 'descr', 'calculationType', 'statisticalFlag'], conditionTypes);
writeCsv('com.my.sales-ProductTypes.csv', ['code', 'name', 'descr'], productTypes);

writeCsv(
  'com.my.sales-SalesOrganizations.csv',
  ['ID', 'code', 'name', 'country_code', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'],
  salesOrganizations
);

writeCsv(
  'com.my.sales-SalesAreas.csv',
  ['ID', 'salesOrganization_ID', 'distributionChannel_code', 'division_code', 'name', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'],
  salesAreas
);

writeCsv(
  'com.my.sales-BusinessPartners.csv',
  ['ID', 'code', 'name', 'name2', 'country_code', 'language_code', 'taxNumber1', 'blocked', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'],
  businessPartners
);

writeCsv(
  'com.my.sales-BusinessPartnerAddresses.csv',
  ['ID', 'partner_ID', 'addressType', 'street', 'city', 'postalCode', 'country_code', 'isDefault', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'],
  businessPartnerAddresses
);

writeCsv(
  'com.my.sales-Products.csv',
  ['ID', 'code', 'name', 'description', 'type_code', 'baseUnit', 'authorizationGroup', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'],
  products
);

writeCsv(
  'com.my.sales-ProductPrices.csv',
  ['product_ID', 'priceType', 'validFrom', 'validTo', 'amount', 'currency_code', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'],
  productPrices
);

writeCsv(
  'com.my.sales-SalesOrders.csv',
  ['ID', 'salesOrder', 'salesOrderType_code', 'salesArea_ID', 'orderDate', 'requestedDelivDate', 'pricingDate', 'netAmount', 'transactionCurrency_code', 'purchaseOrderNumber', 'purchaseOrderDate', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy', 'deletionIndicator', 'overallStatus', 'deliveryStatus', 'billingStatus', 'lastEventType', 'lastEventAt'],
  salesOrders
);

writeCsv(
  'com.my.sales-SalesOrderItems.csv',
  ['ID', 'order_ID', 'itemNumber', 'product_ID', 'orderQuantity', 'orderQuantityUnit', 'netAmount', 'transactionCurrency_code', 'higherLevelItem_ID', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy', 'deletionIndicator'],
  salesOrderItems
);

writeCsv(
  'com.my.sales-SalesOrderItemConditions.csv',
  ['item_ID', 'conditionStep', 'conditionType_code', 'conditionRate', 'conditionCurrency_code', 'conditionValue', 'conditionBase', 'conditionQuantityUnit', 'calculationType', 'statisticalFlag'],
  salesOrderItemConditions
);

writeCsv(
  'com.my.sales-SalesOrderScheduleLines.csv',
  ['item_ID', 'scheduleLineNo', 'deliveryDate', 'confirmedQty', 'requestedQty', 'quantityUnit', 'scheduleLineCategory_code', 'mrpElement', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'],
  salesOrderScheduleLines
);

writeCsv(
  'com.my.sales-SalesOrderPartners.csv',
  ['order_ID', 'role', 'partner_ID', 'address_ID', 'partnerName', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'],
  salesOrderPartners
);

writeCsv(
  'com.my.sales-SalesOrderHeaderTexts.csv',
  ['order_ID', 'textId', 'language', 'text', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'],
  salesOrderHeaderTexts
);

writeCsv(
  'com.my.sales-SalesOrderItemTexts.csv',
  ['item_ID', 'textId', 'language', 'text', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'],
  salesOrderItemTexts
);

console.log('Done.');
