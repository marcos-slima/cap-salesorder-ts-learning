// Entry point — aggregates all domain and master-data CDS models.
// CAP's model auto-discovery reads only the immediate files in db/.
using from './domain/sales-orders';
using from './masterdata/master-data';
using from './aspects/domain-aspects';
using from './types/common-types';
using from './integration/northwind-shadow';
