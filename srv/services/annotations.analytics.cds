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
    name                     @Analytics.Dimension: true;
    overallStatus            @Analytics.Dimension: true;
    deliveryStatus           @Analytics.Dimension: true;
    billingStatus            @Analytics.Dimension: true;
    transactionCurrency_code @Analytics.Dimension: true;
    transactionCurrency_code @Common.Label: 'Moeda';
    netAmount                @Analytics.Measure: true  @Aggregation.default: #SUM;
    netAmount                @Measures.ISOCurrency: transactionCurrency_code;
};

annotate analytics.OpenOrdersQuery with @(
    Analytics.AggregatedProperty #NetAmountSum: {
        $Type               : 'Analytics.AggregatedPropertyType',
        Name                : 'NetAmountSum',
        AggregatableProperty: netAmount,
        AggregationMethod   : 'sum',
        @Measures.ISOCurrency: transactionCurrency_code,
        @Common.Label       : 'Net Amount'
    }
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

annotate analytics.DeliveryScheduleQuery with {
    salesOrderNumber         @Analytics.Dimension: true;
    itemNumber               @Analytics.Dimension: true;
    scheduleLineNo           @Analytics.Dimension: true;
    productCode              @Analytics.Dimension: true;
    productName              @Analytics.Dimension: true;
    deliveryDate             @Analytics.Dimension: true;
    quantityUnit             @Analytics.Dimension: true;
    scheduleLineCategoryCode @Analytics.Dimension: true;
    confirmedQty             @Analytics.Measure: true  @Aggregation.default: #SUM;
    requestedQty             @Analytics.Measure: true  @Aggregation.default: #SUM;
};
