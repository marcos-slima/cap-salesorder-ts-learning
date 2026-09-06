sap.ui.define([
    "sap/ui/test/opaQunit",
    "./pages/JourneyRunner"
], function (opaTest, runner) {
    "use strict";

    function journey() {
        QUnit.module("First journey");

        opaTest("Start application", function (Given, When, Then) {
            Given.iStartMyApp();

            Then.onTheOpenOrdersQueryList.iSeeThisPage();
            Then.onTheOpenOrdersQueryList.onFilterBar().iCheckFilterField("salesOrgCode");
            Then.onTheOpenOrdersQueryList.onFilterBar().iCheckFilterField("overallStatus");
            Then.onTheOpenOrdersQueryList.onFilterBar().iCheckFilterField("deliveryStatus");
            Then.onTheOpenOrdersQueryList.onFilterBar().iCheckFilterField("{i18n>OrderDate}");
            Then.onTheOpenOrdersQueryList.onTable().iCheckColumns(9, {"salesOrder":{"header":"Order"},"orderDate":{"header":"Order Date"},"salesOrgCode":{"header":"Sales Org"},"soldToName":{"header":"Sold-To"},"overallStatus":{"header":"Status"},"deliveryStatus":{"header":"Delivery"},"billingStatus":{"header":"Billing"},"netAmount":{"header":"Net Amount"},"transactionCurrencyCode":{"header":"Currency"}});

        });


        opaTest("Navigate to ObjectPage", function (Given, When, Then) {
            // Note: this test will fail if the ListReport page doesn't show any data
            
            When.onTheOpenOrdersQueryList.onFilterBar().iExecuteSearch();
            
            Then.onTheOpenOrdersQueryList.onTable().iCheckRows();

            When.onTheOpenOrdersQueryList.onTable().iPressRow(0);
            Then.onTheOpenOrdersQueryObjectPage.iSeeThisPage();

        });

        opaTest("Teardown", function (Given, When, Then) { 
            // Cleanup
            Given.iTearDownMyApp();
        });
    }

    runner.run([journey]);
});