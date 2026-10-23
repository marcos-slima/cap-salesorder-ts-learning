using SalesOperationalService as service from './sales-order-service';
using SalesCatalogService as catalog from './sales-order-service';
using SalesAnalyticsService as analytics from './sales-order-service';

// UI annotations for transactional and analytical consumers.

annotate service.SalesOrders with {
    salesOrder @Common.SemanticKey;
};

annotate service.SalesOrders with @(
    UI.HeaderInfo: {
        TypeName      : 'Sales Order',
        TypeNamePlural: 'Sales Orders',
        Title         : { Value: salesOrder },
        Description   : { Value: soldTo.partnerName }
    },
    UI.SelectionFields: [
        salesOrder,
        orderDate,
        requestedDelivDate,
        overallStatus,
        deliveryStatus
    ],
    UI.SelectionVariant: {
        $Type: 'UI.SelectionVariantType',
        SelectOptions: [
            {
                $Type: 'UI.SelectOptionType',
                PropertyName: IsActiveEntity,
                Ranges: [
                    {
                        $Type : 'UI.SelectionRangeType',
                        Sign  : #I,
                        Option: #EQ,
                        Low   : true
                    }
                ]
            }
        ]
    },
    UI.LineItem: [
        { $Type: 'UI.DataField', Value: salesOrder, Label: 'Sales Order' },
        { Value: orderDate,           Label: 'Order Date' },
        { Value: requestedDelivDate,  Label: 'Requested Delivery' },
        { Value: soldTo.partnerName,  Label: 'Sold-To' },
        { Value: netAmount,           Label: 'Net Amount' },
        { Value: transactionCurrency, Label: 'Currency' },
        { Value: overallStatus,       Label: 'Overall Status' },
        { Value: deliveryStatus,      Label: 'Delivery Status' }
    ],
    UI.Identification: [
        { Value: salesOrder, Label: 'Sales Order' },
        { Value: orderDate, Label: 'Order Date' },
        { $Type: 'UI.DataFieldForAction', Action: 'SalesOperationalService.submitOrder', Label: 'Submit' },
        { $Type: 'UI.DataFieldForAction', Action: 'SalesOperationalService.confirmDelivery', Label: 'Confirm Delivery' },
        { $Type: 'UI.DataFieldForAction', Action: 'SalesOperationalService.recalculatePricing', Label: 'Recalculate Pricing' },
        { $Type: 'UI.DataFieldForAction', Action: 'SalesOperationalService.logicalDelete', Label: 'Delete' }
    ],
    UI.Facets: [
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'GeneralInformation',
            Label : 'General Information',
            Target: '@UI.FieldGroup#GeneralInformation'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'Items',
            Label : 'Items',
            Target: 'items/@UI.LineItem'
        }
    ],
    UI.FieldGroup #GeneralInformation: {
        Data: [
            { Value: salesOrder,          Label: 'Sales Order' },
            { Value: salesOrderType.name, Label: 'Order Type' },
            { Value: orderDate,           Label: 'Order Date' },
            { Value: requestedDelivDate,  Label: 'Requested Delivery' },
            { Value: soldTo.partnerName,  Label: 'Sold-To' },
            { Value: netAmount,           Label: 'Net Amount' },
            { Value: transactionCurrency, Label: 'Currency' },
            { Value: overallStatus,       Label: 'Overall Status' },
            { Value: deliveryStatus,      Label: 'Delivery Status' }
        ]
    }
);

annotate service.SalesOrderItems with @(
    UI.HeaderInfo: {
        TypeName      : 'Sales Order Item',
        TypeNamePlural: 'Sales Order Items',
        Title         : { Value: itemNumber },
        Description   : { Value: product.name }
    },
    UI.LineItem: [
        { $Type: 'UI.DataField', Value: itemNumber, Label: 'Item' },
        { Value: product.code,        Label: 'Product Code' },
        { Value: product.name,        Label: 'Product Name' },
        { Value: orderQuantity,       Label: 'Quantity' },
        { Value: orderQuantityUnit,   Label: 'Unit' },
        { Value: netAmount,           Label: 'Net Amount' },
        { Value: transactionCurrency, Label: 'Currency' }
    ],
    UI.Facets: [
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'GeneralInformation',
            Label : 'General Information',
            Target: '@UI.FieldGroup#GeneralInformation'
        }
    ],
    UI.FieldGroup #GeneralInformation: {
        Data: [
            { Value: itemNumber,          Label: 'Item' },
            { Value: product.code,        Label: 'Product Code' },
            { Value: product.name,        Label: 'Product Name' },
            { Value: orderQuantity,       Label: 'Quantity' },
            { Value: orderQuantityUnit,   Label: 'Unit' },
            { Value: netAmount,           Label: 'Net Amount' },
            { Value: transactionCurrency, Label: 'Currency' }
        ]
    }
);

annotate service.Products with @(
    UI.HeaderInfo: {
        TypeName      : 'Product',
        TypeNamePlural: 'Products',
        Title         : { Value: code },
        Description   : { Value: name }
    },
    UI.SelectionFields: [
        code,
        name,
        type.code,
        baseUnit
    ],
    UI.LineItem: [
        { Value: code,        Label: 'Product Code' },
        { Value: name,        Label: 'Product Name' },
        { Value: description, Label: 'Description' },
        { Value: type.name,   Label: 'Product Type' },
        { Value: baseUnit,    Label: 'Base Unit' }
    ],
    UI.Facets: [
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'GeneralInformation',
            Label : 'General Information',
            Target: '@UI.FieldGroup#GeneralInformation'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'Prices',
            Label : 'Prices',
            Target: 'prices/@UI.LineItem'
        }
    ],
    UI.FieldGroup #GeneralInformation: {
        Data: [
            { Value: code,        Label: 'Product Code' },
            { Value: name,        Label: 'Product Name' },
            { Value: description, Label: 'Description' },
            { Value: type.code,   Label: 'Product Type Code' },
            { Value: type.name,   Label: 'Product Type' },
            { Value: baseUnit,    Label: 'Base Unit' }
        ]
    }
);

annotate catalog.ProductPrices with @(
    UI.LineItem: [
        { Value: priceType,   Label: 'Price Type' },
        { Value: validFrom,   Label: 'Valid From' },
        { Value: validTo,     Label: 'Valid To' },
        { Value: amount,      Label: 'Amount' },
        { Value: currency,    Label: 'Currency' }
    ]
);

annotate analytics.OpenOrdersQuery with @(
    UI.HeaderInfo        : {
        TypeName      : 'Open Order',
        TypeNamePlural: 'Open Orders',
        Title         : { Value: salesOrder },
        Description   : { Value: soldToName }
    },
    UI.PresentationVariant: {
        $Type         : 'UI.PresentationVariantType',
        Visualizations: ['@UI.LineItem']
    },
    UI.SelectionVariant   : {
        $Type: 'UI.SelectionVariantType'
    },
    UI.SelectionPresentationVariant: {
        $Type              : 'UI.SelectionPresentationVariantType',
        SelectionVariant   : @UI.SelectionVariant,
        PresentationVariant: @UI.PresentationVariant,
        Text               : 'Open Orders Analysis'
    },
    UI.Identification    : [
        { Value: salesOrder,              Label: 'Order' },
        { Value: soldToName,              Label: 'Sold-To' },
        { Value: salesOrgCode,            Label: 'Sales Org' },
        { Value: orderDate,               Label: 'Order Date' },
        { Value: requestedDelivDate,      Label: 'Requested Delivery' },
        { Value: overallStatus,           Label: 'Status' },
        { Value: deliveryStatus,          Label: 'Delivery' },
        { Value: billingStatus,           Label: 'Billing' },
        { Value: netAmount,               Label: 'Net Amount' },
        { Value: transactionCurrency_code, Label: 'Moeda' }
    ],
    UI.Facets             : [
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'GeneralInformation',
            Label : 'General Information',
            Target: '@UI.FieldGroup#GeneralInformation'
        }
    ],
    UI.FieldGroup #GeneralInformation: {
        Data: [
            { Value: salesOrder,              Label: 'Order' },
            { Value: soldToName,              Label: 'Sold-To' },
            { Value: name,                    Label: 'Customer Name' },
            { Value: salesOrgCode,            Label: 'Sales Org' },
            { Value: distributionChannelCode, Label: 'Distribution Channel' },
            { Value: orderDate,               Label: 'Order Date' },
            { Value: requestedDelivDate,      Label: 'Requested Delivery' },
            { Value: overallStatus,           Label: 'Overall Status' },
            { Value: deliveryStatus,          Label: 'Delivery Status' },
            { Value: billingStatus,           Label: 'Billing Status' },
            { Value: netAmount,               Label: 'Net Amount' },
            { Value: transactionCurrency_code, Label: 'Moeda' }
        ]
    },
    UI.SelectionFields    : [salesOrgCode, overallStatus, deliveryStatus, orderDate],
    UI.LineItem           : [
        { Value: salesOrder,              Label: 'Order' },
        { Value: orderDate,               Label: 'Order Date' },
        { Value: salesOrgCode,            Label: 'Sales Org' },
        { Value: soldToName,              Label: 'Sold-To' },
        { Value: overallStatus,           Label: 'Status' },
        { Value: deliveryStatus,          Label: 'Delivery' },
        { Value: billingStatus,           Label: 'Billing' },
        { Value: netAmount,               Label: 'Net Amount' }
    ]
);

annotate analytics.OpenOrdersQuery with @(
    UI.Chart #ALP: {
        $Type          : 'UI.ChartDefinitionType',
        ChartType      : #Bar,
        Title          : 'Net Amount by Sales Organisation',
        Dimensions     : [salesOrgCode],
        Measures       : [netAmount]
    },
    UI.PresentationVariant #ALP: {
        $Type         : 'UI.PresentationVariantType',
        Visualizations: ['@UI.Chart#ALP', '@UI.LineItem']
    },
    UI.SelectionVariant #ALP: {
        $Type       : 'UI.SelectionVariantType',
        SelectOptions: [
            {
                $Type        : 'UI.SelectOptionType',
                PropertyName : transactionCurrency_code,
                Ranges       : [
                    {
                        $Type : 'UI.SelectionRangeType',
                        Sign  : #I,
                        Option: #EQ,
                        Low   : 'USD'
                    }
                ]
            }
        ]
    },
    UI.SelectionPresentationVariant #ALP: {
        $Type              : 'UI.SelectionPresentationVariantType',
        SelectionVariant   : @UI.SelectionVariant#ALP,
        PresentationVariant: @UI.PresentationVariant#ALP,
        Text               : 'Open Orders Analysis ALP'
    }
);

annotate analytics.ItemRevenueQuery with @(
    UI.Chart              : {
        $Type      : 'UI.ChartDefinitionType',
        ChartType  : #Column,
        Title      : 'Revenue by Product',
        Dimensions : [productCode, productName],
        Measures   : [netAmount]
    },
    UI.PresentationVariant: {
        $Type         : 'UI.PresentationVariantType',
        Visualizations: ['@UI.Chart', '@UI.LineItem']
    },
    UI.SelectionFields    : [salesOrgCode, productCode, orderDate, headerDeliveryStatus],
    UI.LineItem           : [
        { Value: salesOrderNumber,   Label: 'Order' },
        { Value: orderDate,          Label: 'Order Date' },
        { Value: productCode,        Label: 'Product' },
        { Value: productName,        Label: 'Product Name' },
        { Value: soldToName,         Label: 'Sold-To' },
        { Value: orderQuantity,      Label: 'Qty' },
        { Value: orderQuantityUnit,  Label: 'UoM' },
        { Value: netAmount,          Label: 'Net Amount' },
        { Value: transactionCurrency, Label: 'Currency' }
    ]
);

annotate analytics.DeliveryScheduleQuery with @(
    UI.Chart              : {
        $Type      : 'UI.ChartDefinitionType',
        ChartType  : #Line,
        Title      : 'Confirmed vs Requested Quantity by Delivery Date',
        Dimensions : [deliveryDate, productCode],
        Measures   : [confirmedQty, requestedQty]
    },
    UI.PresentationVariant: {
        $Type         : 'UI.PresentationVariantType',
        Visualizations: ['@UI.Chart', '@UI.LineItem'],
        SortOrder     : [{ Property: deliveryDate, Descending: false }]
    },
    UI.SelectionFields    : [salesOrderNumber, productCode, deliveryDate, scheduleLineCategoryCode],
    UI.LineItem           : [
        { Value: salesOrderNumber,         Label: 'Order' },
        { Value: itemNumber,               Label: 'Item' },
        { Value: productCode,              Label: 'Product' },
        { Value: productName,              Label: 'Product Name' },
        { Value: deliveryDate,             Label: 'Delivery Date' },
        { Value: requestedQty,             Label: 'Requested Qty' },
        { Value: confirmedQty,             Label: 'Confirmed Qty' },
        { Value: quantityUnit,             Label: 'UoM' },
        { Value: scheduleLineCategoryCode, Label: 'Category' }
    ]
);
