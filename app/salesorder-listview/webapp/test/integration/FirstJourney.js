sap.ui.define([
    "sap/ui/test/opaQunit",
    "./pages/JourneyRunner"
], function (opaTest, runner) {
    "use strict";

    function journey() {
        QUnit.module("First journey");

        opaTest("Start application", function (Given, When, Then) {
            Given.iStartMyApp();

            Then.onTheSalesOrdersList.iSeeThisPage();
            Then.onTheSalesOrdersList.onFilterBar().iCheckFilterField("{i18n>SalesOrderNumber}");
            Then.onTheSalesOrdersList.onFilterBar().iCheckFilterField("{i18n>OrderDate}");
            Then.onTheSalesOrdersList.onFilterBar().iCheckFilterField("{i18n>RequestedDeliveryDate}");
            Then.onTheSalesOrdersList.onFilterBar().iCheckFilterField("overallStatus");
            Then.onTheSalesOrdersList.onFilterBar().iCheckFilterField("deliveryStatus");
            Then.onTheSalesOrdersList.onTable().iCheckColumns(8, {"salesOrder":{"header":"Sales Order"},"orderDate":{"header":"Order Date"},"requestedDelivDate":{"header":"Requested Delivery"},"soldTo/partnerName":{"header":"Sold-To"},"netAmount":{"header":"Net Amount"},"transactionCurrency":{"header":"Currency"},"overallStatus":{"header":"Overall Status"},"deliveryStatus":{"header":"Delivery Status"}});

        });


        opaTest("Navigate to ObjectPage", function (Given, When, Then) {
            // Note: this test will fail if the ListReport page doesn't show any data
            
            When.onTheSalesOrdersList.onFilterBar().iExecuteSearch();
            
            Then.onTheSalesOrdersList.onTable().iCheckRows();

            When.onTheSalesOrdersList.onTable().iPressRow(0);
            Then.onTheSalesOrdersObjectPage.iSeeThisPage();

        });

        opaTest("Teardown", function (Given, When, Then) { 
            // Cleanup
            Given.iTearDownMyApp();
        });
    }

    runner.run([journey]);
});