sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"salesorder-analytics/test/integration/pages/OpenOrdersQueryList",
	"salesorder-analytics/test/integration/pages/OpenOrdersQueryObjectPage"
], function (JourneyRunner, OpenOrdersQueryList, OpenOrdersQueryObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('salesorder-analytics') + '/test/flp.html#app-preview',
        pages: {
			onTheOpenOrdersQueryList: OpenOrdersQueryList,
			onTheOpenOrdersQueryObjectPage: OpenOrdersQueryObjectPage
        },
        async: true
    });

    return runner;
});
