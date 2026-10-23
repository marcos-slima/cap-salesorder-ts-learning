using SalesAnalyticsService as analytics from './sales-order-service';

// Analytical semantics split from UI-specific metadata.

annotate analytics.OpenOrdersQuery with {
    ID                       @Analytics.Dimension: true;
    salesOrder               @Analytics.Dimension: true;
    orderDate                @Analytics.Dimension: true;
    requestedDelivDate       @Analytics.Dimension: true;
    salesOrgCode             @Analytics.Dimension: true;
    distributionChannelCode  @Analytics.Dimension: true;
    soldToName               @Analytics.Dimension: true;
    overallStatus            @Analytics.Dimension: true;
    deliveryStatus           @Analytics.Dimension: true;
    billingStatus            @Analytics.Dimension: true;
    transactionCurrency_code @Analytics.Dimension: true;
    transactionCurrency_code @Common.Label: 'Moeda';
    transactionCurrency_code @Aggregation.default: #MAX;
    netAmount                @Analytics.Measure: true  @Aggregation.default: #SUM;
    netAmount                @Measures.ISOCurrency: transactionCurrency_code;
};

annotate analytics.OpenOrdersQuery with @(
    // Required by CAP for $apply/aggregate without an explicit method
    // (UI5 ALP sends `aggregate(netAmount)`; without this CAP returns
    // "Result type for custom aggregation ... not found").
    Aggregation.CustomAggregate #netAmount    : 'Edm.Decimal',
    Aggregation.CustomAggregate #NetAmountSum : 'Edm.Decimal',
    // UI5 also aggregates the currency of a semantic amount
    // (`aggregate(netAmount,transactionCurrency_code)`), so it needs
    // a custom-aggregate declaration + default method as well.
    Aggregation.CustomAggregate #transactionCurrency_code : 'Edm.String',
    Analytics.AggregatedProperty #NetAmountSum: {
        $Type               : 'Analytics.AggregatedPropertyType',
        Name                : 'NetAmountSum',
        AggregatableProperty: netAmount,
        AggregationMethod   : 'sum',
        @Measures.ISOCurrency: transactionCurrency_code,
        @Common.Label       : 'Net Amount'
    }
);

annotate analytics.ItemRevenueQuery with @(
    Aggregation.CustomAggregate #netAmount     : 'Edm.Decimal',
    Aggregation.CustomAggregate #orderQuantity : 'Edm.Decimal'
);
annotate analytics.ItemRevenueQuery with {
    ID                      @Analytics.Dimension: true;
    salesOrderNumber        @Analytics.Dimension: true;
    orderDate               @Analytics.Dimension: true;
    salesOrgCode            @Analytics.Dimension: true;
    distributionChannelCode @Analytics.Dimension: true;
    soldToName              @Analytics.Dimension: true;
    productCode             @Analytics.Dimension: true;
    productName             @Analytics.Dimension: true;
    orderQuantityUnit       @Analytics.Dimension: true;
    transactionCurrency     @Analytics.Dimension: true;
    headerDeliveryStatus    @Analytics.Dimension: true;
    netAmount               @Analytics.Measure: true  @Aggregation.default: #SUM;
    orderQuantity           @Analytics.Measure: true  @Aggregation.default: #SUM;
};

annotate analytics.DeliveryScheduleQuery with @(
    Aggregation.CustomAggregate #confirmedQty : 'Edm.Decimal',
    Aggregation.CustomAggregate #requestedQty : 'Edm.Decimal',
    Aggregation.CustomAggregate #quantityUnit : 'Edm.String'
);
annotate analytics.DeliveryScheduleQuery with {
    salesOrderNumber         @Analytics.Dimension: true;
    itemNumber               @Analytics.Dimension: true;
    scheduleLineNo           @Analytics.Dimension: true;
    productCode              @Analytics.Dimension: true;
    productName              @Analytics.Dimension: true;
    deliveryDate             @Analytics.Dimension: true;
    quantityUnit             @Analytics.Dimension: true;
    quantityUnit             @Aggregation.default: #MAX;
    scheduleLineCategoryCode @Analytics.Dimension: true;
    confirmedQty             @Analytics.Measure: true  @Aggregation.default: #SUM;
    requestedQty             @Analytics.Measure: true  @Aggregation.default: #SUM;
};
