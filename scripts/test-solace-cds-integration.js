require('dotenv').config();
const cds = require('@sap/cds');

const EVENT = 'integration-incident.connectivity.tested';

async function main() {
  const messaging = new (require('../srv/lib/solace-messaging-service'))(
    'solace-messaging',
    cds.env
  );
  await messaging.init();

  messaging.on(EVENT, (msg) => {
    console.log('[OK] Evento recebido de volta via CDS MessagingService:', JSON.stringify(msg));
    console.log('[OK] Integracao completa validada - CAP Outbox pattern -> Solace real -> de volta.');
    process.exit(0);
  });

  setTimeout(async () => {
    await messaging.emit(EVENT, { hello: 'via SolaceMessagingService', from: 'integration-incident-copilot' });
    console.log('[OK] Evento emitido via messaging.emit() (API padrao do CAP)');
  }, 1500);

  setTimeout(() => {
    console.error('[ERRO] Timeout - evento nao recebido de volta em 12s.');
    process.exit(1);
  }, 12000);
}

main().catch((err) => {
  console.error('[ERRO]', err);
  process.exit(1);
});
