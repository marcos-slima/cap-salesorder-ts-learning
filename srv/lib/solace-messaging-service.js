// Servico de mensageria CDS customizado, usando `rhea` (AMQP 1.0)
// para conectar num broker Solace Cloud real - alternativa SDK-free
// ao Event Mesh nativo da SAP.
//
// AVISO: a API interna exata de `cds.MessagingService` para
// subclasses customizadas nao tem documentacao publica detalhada
// confirmada - esta implementacao segue o padrao inferido de
// plugins oficiais (@cap-js/event-broker), nao uma especificacao
// verificada. Espera-se ajuste apos o primeiro teste real.
const cds = require('@sap/cds');
const container = require('rhea');

class SolaceMessagingService extends cds.MessagingService {
  async init() {
    await super.init();

    const host = process.env.SOLACE_HOST;
    const port = Number(process.env.SOLACE_PORT || 5671);
    const username = process.env.SOLACE_USERNAME;
    const password = process.env.SOLACE_PASSWORD;

    this._senders = new Map();
    this._log = cds.log('solace-messaging');

    this._connection = container.connect({
      host,
      port,
      transport: 'tls',
      username,
      password,
      reconnect: true,
    });

    this._connection.on('connection_open', () => {
      this._log.info('Conexao AMQPS com Solace estabelecida (CDS MessagingService)');
    });

    this._connection.on('connection_error', (context) => {
      this._log.error('Erro de conexao com Solace:', context.connection?.error || context.error);
    });

    this._connection.on('message', (context) => {
      const topic = context.receiver?.source?.address;
      let data;
      try {
        data = JSON.parse(context.message.body);
      } catch {
        data = context.message.body;
      }
      this._log.info(`Mensagem recebida no topico "${topic}"`);
      this.tx(() => super.emit(topic, data));
    });

    return this;
  }

  on(event, handler) {
    // Ao registrar um handler de evento na app, tambem abre um
    // receiver AMQP para esse topico no broker real.
    if (typeof event === 'string' && event !== '*' && this._connection) {
      this._connection.open_receiver(event);
    }
    return super.on(event, handler);
  }

  async emit(event, data) {
    if (typeof event === 'object') {
      data = event.data;
      event = event.event;
    }
    if (!this._senders.has(event)) {
      this._senders.set(event, this._connection.open_sender(event));
    }
    this._senders.get(event).send({ body: JSON.stringify(data) });
    this._log.info(`Evento "${event}" publicado no Solace`);
    return super.emit(event, data);
  }
}

module.exports = SolaceMessagingService;
