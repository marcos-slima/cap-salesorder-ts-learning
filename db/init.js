const fs = require('fs')
const path = require('path')
const cds = require('@sap/cds')

module.exports = async function seed(db) {
  const csvDir = path.join(__dirname, 'data')
  const hasCsvSeed = fs.existsSync(csvDir) && fs.readdirSync(csvDir).some((f) => f.endsWith('.csv'))

  // When CSV seed files are present, CAP will load them after init.js.
  // Skip manual seed to avoid PK conflicts on code lists and master data.
  if (hasCsvSeed) return

  const { UPSERT } = cds.ql
  const upsert = (entity, entries) => db.run(UPSERT.into(entity).entries(entries))

  await upsert('com.my.sales.DistributionChannels', [
    { code: '10', name: 'Direct Sales', descr: 'Sales directly to end customers' },
    { code: '20', name: 'Retail', descr: 'Sales through retail partners' }
  ])

  await upsert('com.my.sales.Divisions', [
    { code: '10', name: 'Technology', descr: 'Hardware and software lines' },
    { code: '20', name: 'Services', descr: 'Professional and managed services' }
  ])

  await upsert('com.my.sales.SalesOrderTypes', [
    { code: 'OR', name: 'Standard Order', descr: 'Standard sales order' }
  ])

  await upsert('com.my.sales.ScheduleLineCategories', [
    { code: 'CP', name: 'Standard Order', descr: 'Standard schedule line with ATP check' }
  ])

  await upsert('com.my.sales.ProductTypes', [
    { code: 'FERT', name: 'Finished Product', descr: 'Finished goods for direct sales' }
  ])

  await upsert('com.my.sales.SalesOrganizations', [
    {
      ID: '550e8400-e29b-41d4-a716-446655440101',
      code: '1000',
      name: 'Global Sales Org',
      country_code: 'US'
    }
  ])

  await upsert('com.my.sales.SalesAreas', [
    {
      ID: '550e8400-e29b-41d4-a716-446655440102',
      salesOrganization_ID: '550e8400-e29b-41d4-a716-446655440101',
      distributionChannel_code: '10',
      division_code: '10',
      name: 'Global Direct Technology'
    }
  ])

  await upsert('com.my.sales.Products', [
    {
      ID: '550e8400-e29b-41d4-a716-446655440201',
      code: 'MAT-1000',
      name: 'Notebook Pro 14',
      description: 'Reference product for sales order tests',
      type_code: 'FERT',
      baseUnit: 'EA'
    }
  ])

  await upsert('com.my.sales.BusinessPartners', [
    {
      ID: '550e8400-e29b-41d4-a716-446655440301',
      code: '0000100001',
      name: 'Acme Corp',
      country_code: 'US',
      language_code: 'en',
      blocked: false
    }
  ])

  await upsert('com.my.sales.SalesOrders', [
    {
      ID: '550e8400-e29b-41d4-a716-446655440001',
      salesOrder: 'SO10000001',
      salesOrderType_code: 'OR',
      salesArea_ID: '550e8400-e29b-41d4-a716-446655440102',
      orderDate: '2025-08-15',
      requestedDelivDate: '2025-09-01',
      pricingDate: '2025-08-15',
      netAmount: 12500,
      transactionCurrency_code: 'USD',
      purchaseOrderNumber: 'PO-2025-1001',
      purchaseOrderDate: '2025-08-14',
      deletionIndicator: ' ',
      overallStatus: 'A',
      deliveryStatus: 'A',
      billingStatus: 'A'
    }
  ])

  await upsert('com.my.sales.SalesOrderPartners', [
    {
      order_ID: '550e8400-e29b-41d4-a716-446655440001',
      role: 'AG',
      partner_ID: '550e8400-e29b-41d4-a716-446655440301',
      partnerName: 'Acme Corp'
    }
  ])

  await upsert('com.my.sales.SalesOrderItems', [
    {
      ID: '550e8400-e29b-41d4-a716-446655440010',
      order_ID: '550e8400-e29b-41d4-a716-446655440001',
      itemNumber: 10,
      product_ID: '550e8400-e29b-41d4-a716-446655440201',
      orderQuantity: 100,
      orderQuantityUnit: 'EA',
      netAmount: 12500,
      transactionCurrency_code: 'USD',
      deletionIndicator: ' '
    }
  ])

  await upsert('com.my.sales.SalesOrderScheduleLines', [
    {
      item_ID: '550e8400-e29b-41d4-a716-446655440010',
      scheduleLineNo: 1,
      deliveryDate: '2025-09-01',
      confirmedQty: 50,
      requestedQty: 50,
      quantityUnit: 'EA',
      scheduleLineCategory_code: 'CP',
      mrpElement: 'PRD-50001'
    },
    {
      item_ID: '550e8400-e29b-41d4-a716-446655440010',
      scheduleLineNo: 2,
      deliveryDate: '2025-10-01',
      confirmedQty: 50,
      requestedQty: 50,
      quantityUnit: 'EA',
      scheduleLineCategory_code: 'CP',
      mrpElement: 'PRD-50002'
    }
  ])
}
