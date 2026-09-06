# Exemplos de Código — Refatorações Recomendadas

Este arquivo contém código corrigido e padrões melhorados baseados na análise técnica.

---

## 1. ERROR HANDLING CENTRALIZADO

### Antes (problema)

```typescript
// srv/handlers/sales-order-service.ts
srv.on('submitOrder', 'SalesOrders', async (req) => {
    try {
        const order = await SELECT.one.from('SalesOrders')
            .where({ ID: req.params[0] });
        
        if (!order) {
            return req.error(404, 'Order not found');
        }
        
        // Mais lógica...
    } catch (err) {
        console.error('Error:', err); // ✗ Inconsistente
        return req.reject(500, 'Server error');
    }
});
```

**Problemas:**
- Cada handler erra diferente
- Sem structured logging
- Sem correlationId
- Status codes inconsistentes

### Depois (solução)

```typescript
// srv/lib/errors.ts
export class ValidationError extends Error {
    constructor(
        public message: string,
        public code: string = 'VALIDATION_FAILED',
        public details?: Record<string, any>
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends Error {
    constructor(entity: string, id: string) {
        super(`${entity} not found: ${id}`);
        this.name = 'NotFoundError';
    }
}

export class UnauthorizedError extends Error {
    constructor(message = 'Unauthorized') {
        super(message);
        this.name = 'UnauthorizedError';
    }
}

export class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConflictError';
    }
}

// srv/middleware/error-handler.ts
import { nanoid } from 'nanoid';
import * as Errors from '../lib/errors';

function getHttpStatus(err: any): number {
    if (err.name === 'NotFoundError') return 404;
    if (err.name === 'UnauthorizedError') return 401;
    if (err.name === 'ValidationError') return 422;
    if (err.name === 'ConflictError') return 409;
    return 500;
}

export function errorHandler(err: any, req: any, res: any, next: any) {
    const correlationId = req.correlationId || nanoid();
    const LOG = cds.log('ErrorHandler')({ correlationId, user: req.user?.id });

    const statusCode = getHttpStatus(err);
    const code = err.code || err.name;

    if (statusCode < 500) {
        LOG.warn({
            error: code,
            message: err.message,
            statusCode,
            details: err.details || {}
        });
    } else {
        LOG.error({
            error: code,
            message: err.message,
            statusCode,
            stack: err.stack
        });
    }

    const response = {
        error: {
            code,
            message: err.message,
            ...(err.details && { details: err.details }),
            correlationId
        }
    };

    res.status(statusCode).json(response);
}

// srv/server.ts
import { errorHandler } from './middleware/error-handler';

module.exports = cds.server;
cds.on('listening', () => {
    const app = require('express')();
    // ... outros middleware ...
    app.use(errorHandler); // Sempre por último
});

// Uso em handlers
srv.on('submitOrder', 'SalesOrders', async (req) => {
    const order = await SELECT.one.from('SalesOrders')
        .where({ ID: req.params[0] });
    
    if (!order) {
        throw new NotFoundError('SalesOrder', req.params[0]);
    }

    await validator.validateForSubmit(order);
    
    // Lógica...
});
```

---

## 2. VALIDAÇÃO FORTIFIED COM ZOD

### Exemplo: Criar Pedido

```typescript
// srv/lib/validators/sales-order-validator.ts
import { z } from 'zod';

export const SalesOrderCreateSchema = z.object({
    salesOrder: z.string()
        .regex(/^\d{10}$/, 'Must be 10 digits'),
    salesOrderType_code: z.enum(['OR', 'ZO', 'KO', 'QT']),
    orderDate: z.string().datetime()
        .transform(str => new Date(str))
        .refine(date => date <= new Date(), 'Order date cannot be in future'),
    requestedDelivDate: z.string().datetime(),
    netAmount: z.number()
        .positive('Must be positive')
        .multipleOf(0.01, 'Max 2 decimals'),
    transactionCurrency_code: z.string()
        .length(3)
        .regex(/^[A-Z]{3}$/, 'Must be ISO currency code'),
    soldToParty_ID: z.string().uuid(),
    shipToParty_ID: z.string().uuid(),
    billToParty_ID: z.string().uuid(),
    partners: z.array(z.object({
        role: z.enum(['AG', 'WE', 'RE']),
        partner_ID: z.string().uuid()
    })).min(1),
    items: z.array(z.object({
        itemNumber: z.number().positive().int(),
        product_ID: z.string().uuid(),
        quantity: z.number().positive(),
        unit: z.string().length(3),
        netPrice: z.number().positive().multipleOf(0.01)
    })).min(1)
});

export type SalesOrderCreateDTO = z.infer<typeof SalesOrderCreateSchema>;

// Validador
export class SalesOrderValidator {
    async validateCreate(data: any): Promise<SalesOrderCreateDTO> {
        try {
            const validated = await SalesOrderCreateSchema.parseAsync(data);
            
            // Validações extra (DB) após schema
            await this.assertPartnerExists(validated.soldToParty_ID);
            await this.assertProductsExist(validated.items.map(i => i.product_ID));
            
            return validated;
        } catch (err: any) {
            if (err instanceof z.ZodError) {
                throw new ValidationError(
                    'Sales order validation failed',
                    'SALES_ORDER_VALIDATION_FAILED',
                    {
                        errors: err.errors.map(e => ({
                            path: e.path.join('.'),
                            message: e.message,
                            code: e.code
                        }))
                    }
                );
            }
            throw err;
        }
    }

    private async assertPartnerExists(partnerId: string) {
        const partner = await SELECT.one.from('BusinessPartners')
            .columns(c => c('ID')).where({ ID: partnerId });
        
        if (!partner) {
            throw new ValidationError(
                'Partner not found',
                'PARTNER_NOT_FOUND',
                { partnerId }
            );
        }
    }

    private async assertProductsExist(productIds: string[]) {
        const products = await SELECT.from('Products')
            .columns(c => c('ID'))
            .where({ ID: { in: productIds } });
        
        const missing = productIds.filter(
            id => !products.find(p => p.ID === id)
        );
        
        if (missing.length > 0) {
            throw new ValidationError(
                'Some products not found',
                'PRODUCTS_NOT_FOUND',
                { missingIds: missing }
            );
        }
    }
}

// srv/handlers/order-header-handler.ts
import { SalesOrderValidator, SalesOrderCreateDTO } from '../lib/validators/sales-order-validator';
import { ValidationError } from '../lib/errors';

class OrderHeaderHandler {
    private validator = new SalesOrderValidator();

    register(srv: any) {
        srv.before('CREATE', 'SalesOrders', this.beforeCreate.bind(this));
    }

    private async beforeCreate(req: any) {
        try {
            const validated = await this.validator.validateCreate(req.data);
            req.data = validated; // Atualizar com dados validados
        } catch (err) {
            if (err instanceof ValidationError) {
                return req.reject(422, err.message, err.details);
            }
            throw err;
        }
    }
}
```

---

## 3. RATE LIMITING

```typescript
// srv/middleware/rate-limiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redis from 'redis';

let store = new rateLimit.MemoryStore(); // Dev

if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
    const client = redis.createClient({
        url: process.env.REDIS_URL
    });
    store = new RedisStore({
        client,
        prefix: 'rate-limit:'
    });
}

export const apiLimiter = rateLimit({
    store,
    windowMs: 15 * 60 * 1000, // 15 min
    max: (req) => {
        // SalesManager e Admin: limite maior
        if (req.user?.roles?.includes('SalesManager')) return 500;
        if (req.user?.roles?.includes('Admin')) return 1000;
        return 100; // Padrão
    },
    message: {
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please retry after 15 minutes'
        }
    },
    standardHeaders: true, // X-RateLimit-* headers
    legacyHeaders: false,
    skip: (req) => {
        // Health check não conta
        return req.path === '/health';
    }
});

// srv/server.ts
import { apiLimiter } from './middleware/rate-limiter';

cds.on('listening', ({ server }) => {
    const app = server.app;
    app.use('/odata/', apiLimiter);
});
```

---

## 4. STRUCTURED LOGGING com CORRELAÇÃO

```typescript
// srv/middleware/request-logging.ts
import { nanoid } from 'nanoid';

export function requestLogger(req: any, res: any, next: any) {
    const correlationId = req.get('X-Correlation-ID') || nanoid();
    req.correlationId = correlationId;

    const LOG = cds.log('HTTP', { correlationId });

    const startTime = Date.now();

    LOG.info({
        event: 'request.started',
        method: req.method,
        path: req.path,
        query: req.query,
        user: req.user?.id || 'anonymous',
        tenant: req.tenant?.id || 'default'
    });

    res.on('finish', () => {
        const duration = Date.now() - startTime;

        LOG.info({
            event: 'request.completed',
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            user: req.user?.id || 'anonymous'
        });
    });

    next();
}

// Middleware de contexto
export function contextMiddleware(req: any, res: any, next: any) {
    req.context = {
        correlationId: req.correlationId,
        userId: req.user?.id,
        tenantId: req.tenant?.id,
        timestamp: new Date().toISOString()
    };

    next();
}

// srv/server.ts
import { requestLogger, contextMiddleware } from './middleware/request-logging';

cds.on('listening', ({ server }) => {
    const app = server.app;
    app.use(requestLogger);
    app.use(contextMiddleware);
});

// Uso em handlers
srv.on('submitOrder', 'SalesOrders', async (req) => {
    const LOG = cds.log('SalesOrder', req.context);

    LOG.info({
        event: 'submit_order.started',
        orderId: req.params[0]
    });

    const order = await SELECT.one.from('SalesOrders')
        .where({ ID: req.params[0] });

    if (!order) {
        LOG.warn({
            event: 'submit_order.not_found',
            orderId: req.params[0]
        });
        throw new NotFoundError('SalesOrder', req.params[0]);
    }

    // ... lógica ...

    LOG.info({
        event: 'submit_order.completed',
        orderId: req.params[0]
    });
});
```

---

## 5. DESTINATION SERVICE (NORTHWIND)

### Antes (hardcoded)

```json
// .cdsrc.json
{
  "requires": {
    "Northwind": {
      "kind": "odata-v4",
      "credentials": {
        "url": "https://services.odata.org/V4/Northwind/Northwind.svc"
      }
    }
  }
}
```

### Depois (Destination Service)

```json
// .cdsrc.json
{
  "requires": {
    "Northwind": {
      "kind": "odata-v4",
      "[development]": {
        "credentials": {
          "url": "https://services.odata.org/V4/Northwind/Northwind.svc"
        }
      },
      "[production]": {
        "credentials": {
          "destination": {
            "name": "Northwind"
          }
        }
      }
    }
  }
}
```

```typescript
// srv/integration/northwind-client.ts
import xsenv from '@sap/xsenv';

export class NorthwindClient {
    private destService: any;

    async init() {
        if (process.env.NODE_ENV === 'production') {
            this.destService = xsenv.getServices({
                destinations: { tag: 'destination' }
            }).destinations;
        }
    }

    async getProductsByRange(skip: number, take: number) {
        const db = cds.model;
        
        // CAP resolve automaticamente via Destination Service
        const products = await SELECT.from(db.definitions['Northwind.Products'])
            .limit(take).offset(skip);
        
        return products;
    }
}

// Nada muda no handler — CAP lida com tudo!
```

**Setup no BTP:**
1. BTP > Destination Service > Create Destination
2. Name: `Northwind`
3. Type: HTTP
4. URL: `https://services.odata.org/V4/Northwind`
5. Authentication: Basic (se necessário)

---

## 6. OBSERVABILIDADE: OPENTELEMETRY + LOGGING

```typescript
// srv/observability/otel-setup.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-proto';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function initOTel() {
    if (process.env.NODE_ENV !== 'production') return;

    const resource = Resource.default().merge(
        new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]: 'sales-order-service',
            [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0'
        })
    );

    const sdk = new NodeSDK({
        resource,
        instrumentations: [
            getNodeAutoInstrumentations({
                '@opentelemetry/instrumentation-express': { enabled: true },
                '@opentelemetry/instrumentation-pg': { enabled: true }
            })
        ],
        traceExporter: new OTLPTraceExporter({
            url: process.env.OTEL_COLLECTOR_URL || 'http://localhost:4318/v1/traces'
        })
    });

    sdk.start();
    console.log('[OTEL] OpenTelemetry initialized');

    return () => sdk.shutdown();
}

// srv/observability/metrics.ts
import promClient from 'prom-client';

// Métricas globais
export const ordersCreatedTotal = new promClient.Counter({
    name: 'sales_orders_created_total',
    help: 'Total number of Sales Orders created',
    labelNames: ['salesOrg', 'status']
});

export const orderProcessingDuration = new promClient.Histogram({
    name: 'sales_order_processing_seconds',
    help: 'Sales Order processing time in seconds',
    labelNames: ['operation'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
});

export const apiErrors = new promClient.Counter({
    name: 'sales_api_errors_total',
    help: 'Total API errors',
    labelNames: ['code', 'path', 'method']
});

// srv/server.ts
import { initOtel } from './observability/otel-setup';
import * as metrics from './observability/metrics';
import promClient from 'prom-client';

const shutdown = initOtel();

cds.on('listening', ({ server }) => {
    const app = server.app;

    // Metrics endpoint
    app.get('/metrics', (req, res) => {
        res.type('text/plain');
        res.send(promClient.register.metrics());
    });

    // Health check
    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'UP',
            timestamp: new Date().toISOString()
        });
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    if (shutdown) await shutdown();
});

// Uso em handlers
srv.on('CREATE', 'SalesOrders', async (req) => {
    const timer = orderProcessingDuration.startTimer();

    try {
        // ... lógica ...
        ordersCreatedTotal.inc({
            salesOrg: order.salesArea_ID,
            status: 'created'
        });
    } catch (err) {
        apiErrors.inc({
            code: err.code || 'UNKNOWN',
            path: req.path,
            method: req.method
        });
        throw err;
    } finally {
        timer();
    }
});
```

---

## 7. ÍNDICES EM CDS (HANA)

```cds
// db/domain/sales-orders.cds

entity SalesOrders : managed, cuid {
    key ID : UUID;
    
    salesOrder : SalesOrderNumber;
    salesOrderType_code : String;
    orderDate : Date;
    requestedDelivDate : Date;
    netAmount : Decimal(15, 2);
    
    @Indexes: [
        // Índice 1: Busca por número de pedido (PK lógico)
        {
            elements: [salesOrder],
            unique: true
        },
        // Índice 2: Busca por data + status (filtro comum)
        {
            elements: [orderDate, completionStatus]
        },
        // Índice 3: Busca por creator (auditoria)
        {
            elements: [createdBy]
        },
        // Índice 4: Busca por soft delete
        {
            elements: [deletionIndicator]
        },
        // Índice 5: Busca por partner (assoc join)
        {
            elements: [soldToParty_ID]
        }
    ]

    // Associations
    soldToParty : Association to BusinessPartners;
    // ...
}
```

---

## 8. QUERY OPTIMIZATION

### Antes (N+1 Problem)

```typescript
// Ruim: dispara query por item!
async function getOrdersWithDetails(req) {
    const orders = await SELECT.from('SalesOrders')
        .where({ ...filters });
    
    for (const order of orders) {
        order.items = await SELECT.from('SalesOrderItems')
            .where({ order_ID: order.ID });  // ❌ N queries!
    }
    
    return orders;
}
```

### Depois (Batch Loading)

```typescript
// Bom: 1 query + join memory
async function getOrdersWithDetails(req) {
    // 1. Buscar todos os orders
    const orders = await SELECT.from('SalesOrders')
        .where({ ...filters });
    
    if (orders.length === 0) return [];
    
    const orderIds = orders.map(o => o.ID);
    
    // 2. Buscar items de todos (1 query)
    const items = await SELECT.from('SalesOrderItems')
        .where({ order_ID: { in: orderIds } });
    
    // 3. Associar em memória
    const itemsByOrderId = new Map();
    items.forEach(item => {
        if (!itemsByOrderId.has(item.order_ID)) {
            itemsByOrderId.set(item.order_ID, []);
        }
        itemsByOrderId.get(item.order_ID).push(item);
    });
    
    // 4. Enriquecer orders
    orders.forEach(order => {
        order.items = itemsByOrderId.get(order.ID) || [];
    });
    
    return orders;
}
```

### Ou usar Projections em CDS

```cds
// srv/services/sales-order-service.cds

entity SalesOrders as projection on db.SalesOrders
    excluding { deletionIndicator, lastEventType }
{
    *,
    items: redirected to SalesOrderItems
};

entity SalesOrderItems as projection on db.SalesOrderItems {
    *,
    order: redirected to SalesOrders
};
```

CAP fará o join automaticamente!

---

## 9. OPENAPI/SWAGGER

```typescript
// srv/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Sales Order Service API',
            version: '1.0.0',
            description: 'SAP CAP microservice para gestão de pedidos de venda',
            contact: {
                name: 'API Support',
                email: 'support@example.com'
            },
            license: {
                name: 'Apache 2.0',
                url: 'https://www.apache.org/licenses/LICENSE-2.0.html'
            }
        },
        servers: [
            {
                url: 'http://localhost:4004',
                description: 'Development server'
            },
            {
                url: 'https://myapp.cfapps.eu10.hana.ondemand.com',
                description: 'Production server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT token via XSUAA'
                }
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string' },
                                message: { type: 'string' },
                                details: { type: 'object' }
                            }
                        }
                    }
                },
                SalesOrder: {
                    type: 'object',
                    properties: {
                        ID: { type: 'string', format: 'uuid' },
                        salesOrder: { type: 'string', pattern: '^\\d{10}$' },
                        orderDate: { type: 'string', format: 'date-time' },
                        netAmount: { type: 'number', format: 'decimal' },
                        status: { enum: ['Open', 'InProcess', 'Completed'] }
                    }
                }
            }
        },
        security: [{ bearerAuth: [] }]
    },
    apis: [
        './srv/services/sales-order-service.cds',
        './srv/handlers/*.ts'
    ]
});

// srv/server.ts
import swaggerUI from 'swagger-ui-express';
import { swaggerSpec } from './swagger';

cds.on('listening', ({ server }) => {
    const app = server.app;
    app.use('/api/docs', swaggerUI.serve);
    app.get('/api/docs', swaggerUI.setup(swaggerSpec));
});
```

---

## 10. CLEAN ARCHITECTURE STRUCTURE

Alternativa de estrutura mais escalável para projetos grandes:

```
src/
├── domain/                    # Business logic (zero dependencies externas)
│   ├── sales/
│   │   ├── SalesOrder.ts     # Entity
│   │   ├── SalesOrderFactory.ts
│   │   ├── SalesOrderValidator.ts
│   │   ├── SalesOrderRepository.ts  # Interface/Abstract
│   │   └── SalesOrderService.ts    # Domain service
│   ├── partner/
│   │   └── ...
│
├── application/              # Use cases (orquestração de domínio)
│   ├── sales/
│   │   ├── CreateSalesOrderUseCase.ts
│   │   ├── SubmitSalesOrderUseCase.ts
│   │   ├── ConfirmDeliveryUseCase.ts
│   │   └── ...
│   └── partner/
│       └── ...
│
├── infrastructure/          # Persistência, integração, messaging
│   ├── persistence/
│   │   ├── SalesOrderRepository.ts  # Implementação (CDS)
│   │   ├── PartnerRepository.ts
│   │   └── UnitOfWork.ts       # Transação
│   ├── integration/
│   │   ├── NorthwindClient.ts
│   │   ├── DestinationResolver.ts
│   │   └── ...
│   ├── messaging/
│   │   ├── EventPublisher.ts
│   │   ├── EventSubscriber.ts
│   │   └── ...
│   └── external/
│       ├── HttpClient.ts
│       └── ...
│
├── presentation/           # API Contracts (OData, Controllers)
│   ├── dtos/
│   │   ├── CreateSalesOrderDTO.ts
│   │   ├── SalesOrderResponseDTO.ts
│   │   └── ...
│   ├── controllers/
│   │   ├── SalesOrderController.ts
│   │   └── ...
│   └── middleware/
│       ├── ErrorHandler.ts
│       ├── Logger.ts
│       ├── RateLimiter.ts
│       └── ...
│
├── config/                 # Configuração
│   ├── database.ts
│   ├── cache.ts
│   └── ...
│
└── main.ts                # Entry point
```

**Vantagens:**
- Domain logic completamente independente de framework
- Fácil testar (domain sem mocks)
- Fácil trocar persistência/integração
- Escala bem em times grandes

---

## Conclusão

Os exemplos acima mostram como implementar:

✅ **Error handling centralizado** — consistência em toda API  
✅ **Validação forte** — Zod + validações de BD  
✅ **Rate limiting** — proteção contra abuso  
✅ **Structured logging** — rastreamento e debugging  
✅ **Destination Service** — credenciais centralizadas  
✅ **Observabilidade** — tracing + métricas  
✅ **Índices** — performance em HANA  
✅ **Query optimization** — evitar N+1  
✅ **OpenAPI docs** — API autodocumentada  
✅ **Clean architecture** — escalabilidade  

Todos os padrões seguem **best practices SAP + Node.js** e são production-ready em BTP.
