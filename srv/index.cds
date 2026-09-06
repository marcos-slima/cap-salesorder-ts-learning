// Entry point for service model discovery during local runs and tests.
// CAP auto-discovers top-level CDS files in srv/, so we re-export the
// actual service definitions kept under srv/services/.
using from './services/sales-order-service';
using from './services/integration-service';
using from './services/annotations.ui';
using from './services/annotations.analytics';
