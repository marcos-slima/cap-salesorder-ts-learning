require('dotenv').config();
const container = require('rhea');

const TOPIC = 'integration-incident/connectivity-test';

const connection = container.connect({
  host: process.env.SOLACE_HOST,
  port: Number(process.env.SOLACE_PORT || 5671),
  transport: 'tls',
  username: process.env.SOLACE_USERNAME,
  password: process.env.SOLACE_PASSWORD,
  reconnect: false,
});

let sent = false;

connection.on('connection_open', () => {
  console.log('[OK] Conexao AMQPS estabelecida com o broker Solace.');
  connection.open_sender(TOPIC);
});

connection.on('sendable', (context) => {
  if (sent) return;
  sent = true;
  context.sender.send({ body: 'teste de conectividade - integration-incident-copilot' });
  console.log(`[OK] Mensagem enviada para o topico "${TOPIC}".`);
  setTimeout(() => {
    console.log('[OK] Teste concluido com sucesso - Solace Cloud acessivel via AMQP.');
    connection.close();
    process.exit(0);
  }, 1500);
});

connection.on('disconnected', (context) => {
  console.error('[ERRO] Desconectado do broker:', context.error || '(sem detalhe)');
  process.exit(1);
});

connection.on('connection_error', (context) => {
  console.error('[ERRO] Falha ao conectar:', context.connection.error || context.error);
  process.exit(1);
});

setTimeout(() => {
  console.error('[ERRO] Timeout - nenhuma resposta do broker em 10s.');
  process.exit(1);
}, 10000);
