import cds from '@sap/cds'

const LOG = cds.log('server')

// Log on successful startup
cds.on('listening', ({ url }: { url: string }) => {
  LOG.info(`CAP server listening on ${url}`)
  LOG.info('API endpoints are available under /api/*')
})
