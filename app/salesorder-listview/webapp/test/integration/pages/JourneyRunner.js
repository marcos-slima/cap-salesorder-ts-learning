sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"salesorder-listview/test/integration/pages/SalesOrdersList",
	"salesorder-listview/test/integration/pages/SalesOrdersObjectPage",
	"salesorder-listview/test/integration/pages/SalesOrderItemsObjectPage"
], function (JourneyRunner, SalesOrdersList, SalesOrdersObjectPage, SalesOrderItemsObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('salesorder-listview') + '/test/flp.html#app-preview',
        pages: {
			onTheSalesOrdersList: SalesOrdersList,
			onTheSalesOrdersObjectPage: SalesOrdersObjectPage,
			onTheSalesOrderItemsObjectPage: SalesOrderItemsObjectPage
        },
        async: true
    });

    return runner;
});

