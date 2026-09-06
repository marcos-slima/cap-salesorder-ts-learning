import cds from '@sap/cds'

// Log on successful startup
cds.on('listening', ({ url }: any) => {
  console.info(`\n[server] ✓ CAP server is listening on ${url}`)
  console.info('  API endpoints are available under /api/*\n')
})

cds.on('READ', req => console.log('[OData READ]', req.target.name, req.query))