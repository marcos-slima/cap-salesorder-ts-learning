/**
 * Entry point for srv layer — loads all service definitions and server configuration.
 *
 * IMPORTANT: Import server.ts first to ensure middleware is registered
 * BEFORE CDS services are started.
 */

// Service definitions will be auto-discovered by CAP from:
// - srv/services/sales-order-service.cds
// - srv/services/integration-service.cds
//
// No need to explicitly export here — CAP's model auto-discovery
// will find these CDS files during bootstrap.

