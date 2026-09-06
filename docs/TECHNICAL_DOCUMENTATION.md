# Documentação Técnica — cap-salesorder-ts-learning

> **Versão:** 1.0.0 | **Licença:** Apache-2.0 | **Plataforma:** SAP BTP / Cloud Foundry

---

## Sumário

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Estrutura do Projeto](#2-estrutura-do-projeto)
3. [Configurações do Projeto](#3-configurações-do-projeto)
4. [Dependências do Projeto](#4-dependências-do-projeto)
5. [Código-Fonte](#5-código-fonte)
6. [Fluxos de Execução](#6-fluxos-de-execução)
7. [Como Executar o Projeto](#7-como-executar-o-projeto)
8. [Testes](#8-testes)
9. [Boas Práticas e Padrões Arquiteturais](#9-boas-práticas-e-padrões-arquiteturais)
10. [Possíveis Melhorias](#10-possíveis-melhorias)
11. [Referências de Integração e Deploy](#11-referências-de-integração-e-deploy)
12. [Guia de Aprendizado Prático](#12-guia-de-aprendizado-prático)
13. [Features Avançadas Implementadas](#13-features-avançadas-implementadas)
14. [Fiori Elements Avançado](#14-fiori-elements-avançado)
15. [Multi-Tenancy (SaaS)](#15-multi-tenancy-saas)

---

## 1. Visão Geral do Projeto

### 1.1 Objetivo

Este projeto é uma **implementação de referência** de um domínio de Pedidos de Venda (*Sales Orders*) utilizando o **SAP Cloud Application Programming Model (CAP)** com **TypeScript**. Seu propósito é demonstrar como construir aplicações corporativas no SAP BTP seguindo princípios de **Domain-Driven Design (DDD)**, arquitetura limpa e melhores práticas do ecossistema SAP.

### 1.2 Problema que Resolve

Organizações que utilizam SAP precisam criar extensões ou aplicações side-by-side que:

- Gerenciem pedidos de venda com regras de negócio complexas (status, aprovações, pricing).
- Integrem-se ao ecossistema SAP (S/4HANA, SAP Event Mesh, SAP XSUAA).
- Exponham dados para consumo por Fiori, SAP Build Apps, agentes de IA (Joule) e APIs externas.
- Sigam o **Clean Core Principle** — nunca modificar o sistema SAP padrão, apenas estender.

### 1.3 Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                        CONSUMIDORES                             │
│  Fiori/SAPUI5 │ SAP Build Apps │ SAP Joule │ CPI │ SAC/BW     │
└──────────────────────┬──────────────────────────────────────────┘
                       │ OData v4 / REST
┌──────────────────────▼──────────────────────────────────────────┐
│                   CAMADA DE SERVIÇOS OData                      │
│  SalesOrderService    SalesCatalogService    SalesAnalyticsService │
│  /api/orders          /api/catalog           /api/analytics      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│               CAMADA DE DOMÍNIO (TypeScript)                    │
│   SalesOrderHandler │ SalesOrderValidator │ StatusMachine       │
│                     │ EventPublisher                            │
└──────────┬──────────┴────────────────────┬────────────────────-┘
           │ CQL (CAP Query Language)       │ CloudEvents 1.0
┌──────────▼──────────┐         ┌──────────▼────────────────────┐
│  BANCO DE DADOS      │         │   SAP EVENT MESH              │
│  SQLite (dev/test)  │         │   (produção via Outbox)       │
│  SAP HANA (prod)    │         └───────────────────────────────┘
└─────────────────────┘
```

### 1.4 Principais Tecnologias

| Tecnologia | Versão | Papel |
|---|---|---|
| SAP CAP (`@sap/cds`) | 9.8.5 | Framework principal — modelos, serviços, runtime OData |
| TypeScript | 5+ | Linguagem dos handlers, validadores e testes |
| Node.js | >= 20 | Plataforma de execução |
| SQLite (`@cap-js/sqlite`) | ^2.2 | Banco de dados para desenvolvimento e testes |
| SAP HANA Cloud | — | Banco de dados de produção |
| SAP XSUAA (`@sap/xssec`) | ^4 | Autenticação e autorização JWT |
| SAP Event Mesh | — | Publicação de eventos de domínio |
| Jest + ts-jest | 29+ | Framework de testes |
| SAP MTA / Cloud Foundry | — | Deploy e infraestrutura BTP |

### 1.5 Fluxo de Funcionamento

```
Usuário/Sistema Externo
        │
        ▼
[1] Autenticação via XSUAA (token JWT com scopes/roles)
        │
        ▼
[2] OData v4 Request → CAP Runtime
        │ (valida roles @requires, processa draft, normaliza req)
        ▼
[3] SalesOrderHandler (TypeScript)
        │ hook before/on/after
        ├─[3a] Validação de negócio (SalesOrderValidator)
        ├─[3b] Transição de estado (StatusMachine)
        ├─[3c] Leitura/Escrita no banco (CQL)
        └─[3d] Publicação de evento (EventPublisher → Outbox)
        │
        ▼
[4] Resposta OData JSON ao consumidor
```

---

## 2. Estrutura do Projeto

### 2.1 Mapa de Diretórios

```
cap-salesorder-ts-learning/
│
├── db/                          # Modelos de dados CDS (schema)
│   ├── index.cds                # Ponto de entrada — agrega todos os modelos
│   ├── types/
│   │   └── common-types.cds     # Aliases de tipo e enums de domínio
│   ├── aspects/
│   │   └── domain-aspects.cds   # Mixins reutilizáveis (SoftDeletable, StatusTracked, etc.)
│   ├── domain/
│   │   └── sales-orders.cds     # Agregado raiz: SalesOrders e filhos
│   ├── masterdata/
│   │   └── master-data.cds      # Entidades de suporte (Products, BusinessPartners, etc.)
│   └── integration/
│       └── northwind-shadow.cds # Entidades shadow: ImportRuns, NorthwindOrders/Items/Products, RestProducts
│
├── srv/                         # Serviços e lógica de negócio
│   ├── index.cds                # Ponto de entrada de serviços (service discovery)
│   ├── sales-order-service.ts   # Re-exporta o handler de vendas para o CAP
│   ├── integration-service.ts   # Re-exporta o handler de integração para o CAP
│   ├── services/
│   │   ├── sales-order-service.cds      # Definição dos 3 serviços OData de vendas
│   │   ├── sales-order-service.ts       # Thin orchestrator — instancia sub-handlers
│   │   ├── integration-service.cds      # Definição do IntegrationService (4º serviço)
│   │   └── integration-service.ts       # Re-exporta o handler de integração
│   ├── handlers/
│   │   ├── sales-order-service.ts       # Thin orchestrator — monta sub-handlers
│   │   ├── order-header-handler.ts      # Hooks SalesOrders (create/update/delete/actions)
│   │   ├── order-item-handler.ts        # Hooks SalesOrderItems (netAmount sync, addToDelivery)
│   │   └── integration-service.ts       # Handler IntegrationService (ações + funções)
│   ├── integration/
│   │   ├── types.ts             # Tipos TypeScript: NwOrder, DummyJsonProduct, ImportResult, ...
│   │   ├── http-client.ts       # HttpClient interface + AxiosHttpClient + MockHttpClient
│   │   ├── northwind-client.ts  # NorthwindClient — fetch OData v4 Orders + Products
│   │   ├── rest-client.ts       # RestClient — fetch REST/JSON Products (dummyjson.com)
│   │   ├── marshallers.ts       # unmarshal/marshal: OData↔CDS, REST↔CDS (núcleo didático)
│   │   └── import-orchestrator.ts # Coordena ciclo completo: fetch → unmarshal → upsert
│   ├── lib/
│   │   ├── validations.ts       # SalesOrderValidator
│   │   ├── status-machine.ts    # StatusMachine (máquina de estados)
│   │   └── events.ts            # EventPublisher (CloudEvents 1.0)
│   └── types/
│       └── domain.ts            # Interfaces TypeScript para as entidades CDS
│
├── test/
│   ├── setup-env.ts             # Configuração Jest (habilita CDS_TYPESCRIPT)
│   ├── sales-order-service.test.ts   # Testes: StatusMachine + SalesOrderService HTTP API
│   └── integration-service.test.ts   # Testes: marshallers (unit) + IntegrationService HTTP API
│
├── _i18n/
│   └── i18n.properties          # Labels e mensagens de erro (inglês)
│
├── docs/
│   └── ARCHITECTURE.md          # ADRs e decisões arquiteturais
│
├── @cds-models/                 # Tipos TypeScript gerados automaticamente (typegen)
├── gen/                         # Saída do build CAP (HANA DDL, JS compilado)
│
├── .cdsrc.json                  # Configuração do compilador CDS
├── .cdsprettier.json            # Configuração de formatação CDS
├── mta.yaml                     # Descritor MTA (deploy SAP BTP)
├── xs-security.json             # Roles e scopes XSUAA
├── package.json                 # Dependências e scripts NPM
├── tsconfig.json                # Configuração TypeScript
├── jest.config.js               # Configuração do framework de testes
└── readme.md                    # Guia rápido de início
```

### 2.2 Função de Cada Pasta

| Pasta | Responsabilidade |
|---|---|
| `db/` | Schema de dados em CDS. Define entidades, tipos, enums, views e aspectos. Equivale à camada de persistência. |
| `db/types/` | Tipos primitivos e enumerações reutilizáveis no domínio. Ex: `SalesOrderNumber`, `OverallOrderStatus`. |
| `db/aspects/` | Mixins (traits) que adicionam campos e comportamentos a entidades via `extend`. Ex: `SoftDeletable`, `StatusTracked`. |
| `db/domain/` | Agregado raiz do domínio: `SalesOrders` e todos os seus filhos (items, condições, schedule lines, parceiros, textos). |
| `db/masterdata/` | Entidades de dados mestres e de referência: produtos, business partners, áreas de vendas, listas de código. |
| `db/integration/` | Entidades shadow (staging) que armazenam dados brutos importados de sistemas externos. Namespace separado `com.my.sales.integration`. |
| `srv/` | Serviços OData e lógica de negócio em TypeScript. |
| `srv/services/` | Definições CDS dos serviços (projeções de entidades, ações OData, autorização) **+ arquivos `.ts` homônimos** que o CAP usa como handler de cada serviço. |
| `srv/handlers/` | Implementações TypeScript dos handlers. `sales-order-service.ts` é um thin orchestrator; lógica real fica em `order-header-handler.ts` e `order-item-handler.ts`. |
| `srv/integration/` | Camada de integração com sistemas externos: clientes HTTP (Northwind OData + dummyjson REST), marshallers, orquestrador de importação. |
| `srv/lib/` | Bibliotecas de suporte: validações, máquina de estados, publicação de eventos. |
| `srv/types/` | Interfaces TypeScript definidas manualmente (complementam os tipos gerados em `@cds-models/`). |
| `test/` | Testes automatizados: unitários (StatusMachine, marshallers) e integração (HTTP API contra SQLite in-memory). |
| `_i18n/` | Internacionalização: labels de campos, títulos de serviços, rótulos de enums, mensagens de erro. |
| `docs/` | Documentação arquitetural e ADRs (Architecture Decision Records). |
| `@cds-models/` | Gerado automaticamente por `npm run typegen`. Tipos TypeScript derivados dos modelos CDS. Não editar manualmente. |
| `gen/` | Gerado por `npm run build`. Artefatos de build: DDL HANA, JS compilado, metadata OData. |

---

## 3. Configurações do Projeto

### 3.1 `package.json`

Arquivo central de configuração do projeto Node.js. Além das dependências, contém a seção `"cds"` que configura o comportamento do CAP.

```json
{
  "cds": {
    "typescript": true,
    "requires": {
      "db": {
        "kind": "sqlite",
        "[production]": { "kind": "hana" }
      },
      "auth": {
        "kind": "mocked",
        "[production]": { "kind": "xsuaa" }
      },
      "messaging": {
        "kind": "file-based-messaging",
        "[production]": {
          "kind": "enterprise-messaging-shared",
          "outbox": true
        }
      }
    }
  }
}
```

**Pontos de atenção:**

- `typescript: true` — habilita a descoberta automática de handlers `.ts` pelo CAP.
- O padrão `[production]` sobrepõe configurações quando `NODE_ENV=production`.
- `outbox: true` — garante atomicidade entre gravação no banco e publicação de eventos.

**Scripts disponíveis:**

| Script | Comando | Uso |
|---|---|---|
| `npm start` | `cds-serve` | Servidor de produção |
| `npm run dev` | `cds watch` | Desenvolvimento com live reload |
| `npm run build` | `cds build --production && tsc --noEmit` | Build para produção |
| `npm test` | `jest --forceExit --detectOpenHandles` | Executa todos os testes |
| `npm run test:watch` | `jest --watch` | Testes em modo watch |
| `npm run typegen` | `cds-typer '*' --outputDirectory @cds-models` | Gera tipos TypeScript |
| `npm run lint` | `cds lint` | Linter para modelos CDS |

**Usuários mockados para desenvolvimento:**

| Usuário | Roles | Permissões |
|---|---|---|
| `alice` | SalesProcessor, CatalogReader | Criar/atualizar seus próprios pedidos |
| `bob` | SalesManager, CatalogReader, AnalyticsReader | Acesso completo + trigger de importação |
| `charlie` | SalesAuditor, CatalogReader, AnalyticsReader | Somente leitura em todos os serviços |
| `carol` | CatalogReader | Apenas dados mestres |
| `dave` | AnalyticsReader | Apenas analytics |

### 3.2 `.cdsrc.json`

Configurações do compilador e runtime CDS.

```json
{
  "build": {
    "target": "gen",
    "tasks": [
      { "for": "hana" },
      { "for": "node-cf" }
    ]
  },
  "odata": { "version": "v4", "flavor": "x4" },
  "log": { "format": "json" },
  "i18n": {
    "default_language": "en",
    "fallback_bundle": "_i18n/i18n"
  }
}
```

- `target: "gen"` — saída do build vai para a pasta `gen/`.
- `flavor: "x4"` — usa o perfil OData v4 estendido (recomendado para SAPUI5/Fiori).
- `log.format: "json"` — logs estruturados compatíveis com SAP Cloud Logging.

### 3.3 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "node16",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "sourceMap": true,
    "declaration": true,
    "paths": { "#cds-models/*": ["./@cds-models/*"] }
  },
  "include": ["srv/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist", "@cds-models", "gen"]
}
```

- **`target: ES2022`** — habilita `await` de nível superior (top-level await), compatível com Node 18+.
- **`strict: true`** + verificações extras — máxima segurança de tipos.
- **`paths`** — alias `#cds-models/*` para os tipos gerados automaticamente.
- **`ts-node`** com `transpileOnly: true` — compilação rápida sem verificação completa (apenas para execução; a verificação real ocorre com `tsc --noEmit` no build).

### 3.4 `jest.config.js`

```js
module.exports = {
  preset: 'ts-jest',
  setupFiles: ['./test/setup-env.ts'],
  testMatch: ['**/test/**/*.test.ts'],
  moduleNameMapper: { '^#cds-models/(.*)$': './@cds-models/$1' },
  testTimeout: 30000,
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 }
  }
}
```

- `setupFiles` — executa `test/setup-env.ts` antes de qualquer teste para setar `CDS_TYPESCRIPT=true`.
- `testTimeout: 30000` — necessário porque inicializar o servidor CAP com SQLite leva alguns segundos.
- Thresholds de cobertura garantem qualidade mínima nos testes.

### 3.5 `mta.yaml`

Descreve os módulos e recursos para deploy no SAP BTP (Cloud Foundry).

```
Módulos:
  cap-salesorder-ts-srv        → Node.js runtime (CAP server)
  cap-salesorder-ts-db-deployer → HDI deployer (HANA schema migration)

Recursos (serviços BTP):
  cap-salesorder-db    → SAP HANA Cloud (hdi-shared)
  cap-salesorder-auth  → XSUAA (application plan)
  cap-salesorder-em    → SAP Event Mesh (standard)
  cap-salesorder-conn  → Connectivity Service (acesso on-premise)
```

**Estratégia de deploy:** Blue-green via `cf deploy --strategy blue-green` (zero downtime).

### 3.6 `xs-security.json`

Define os scopes e roles para o XSUAA:

| Scope | Role Template | Descrição |
|---|---|---|
| `SalesProcessor` | SalesProcessor | Criar/atualizar pedidos próprios |
| `SalesManager` | SalesManager | CRUD completo + ações de domínio |
| `SalesAuditor` | SalesAuditor | Leitura de pedidos + analytics |
| `CatalogReader` | CatalogReader | Leitura de dados mestres |
| `AnalyticsReader` | AnalyticsReader | Leitura de views analíticas |

- Validade do token: **12 horas** / refresh: **24 horas**.
- `tenant-mode: dedicated` — aplicação single-tenant.

---

## 4. Dependências do Projeto

### 4.1 Dependências de Produção

| Pacote | Versão | Uso |
|---|---|---|
| `@sap/cds` | 9.8.5 | Framework CAP — runtime OData, CQL, lifecycle hooks, draft, i18n |
| `@sap/xssec` | ^4 | Validação de tokens JWT do XSUAA em produção |
| `@cap-js/change-tracking` | ^1 | Plugin de rastreamento de alterações campo a campo (`@ChangeTracking`) |
| `@cap-js/audit-logging` | ^1 | Plugin de auditoria GDPR/SOX para dados pessoais (`@PersonalData`) |
| `@cap-js/attachments` | ^1 | Plugin de upload/download de anexos via OData Stream (`Edm.Stream`) |

### 4.2 Dependências de Desenvolvimento / Build

| Pacote | Versão | Uso |
|---|---|---|
| `@cap-js/sqlite` | ^2.2.0 | Banco SQLite para desenvolvimento e testes (in-memory) |
| `@cap-js/cds-typer` | ^0.38.0 | Gera tipos TypeScript a partir dos modelos CDS (`npm run typegen`) |
| `@cap-js/cds-test` | ^0.4.1 | Utilitários CAP para testes de integração |
| `typescript` | ^5 | Compilador TypeScript |
| `ts-node` | ^10 | Execução direta de TypeScript (sem compilação prévia) |
| `ts-jest` | ^29 | Integração Jest + TypeScript |
| `jest` | ^29 | Framework de testes |
| `@types/node` | ^20 | Tipos TypeScript para Node.js |
| `@types/jest` | ^29 | Tipos TypeScript para Jest |

### 4.3 Serviços SAP BTP (Produção)

| Serviço | Plano | Papel |
|---|---|---|
| SAP HANA Cloud | hdi-shared | Banco de dados relacional principal |
| SAP XSUAA | application | Autenticação/autorização (OAuth 2.0 + JWT) |
| SAP Event Mesh | standard | Publicação de eventos de domínio (CloudEvents 1.0) |
| SAP Connectivity | lite | Acesso a sistemas on-premise via SAP Cloud Connector |

---

## 5. Código-Fonte

### 5.1 Modelos de Dados CDS (`db/`)

#### 5.1.1 Tipos e Enumerações (`db/types/common-types.cds`)

Define aliases de tipo primitivos (legibilidade + documentação) e enumerações de domínio.

**Aliases de Tipo:**

```cds
type SalesOrderNumber : String(10);    // VBELN no S/4HANA
type BusinessPartner  : String(10);    // KUNNR / LIFNR
type SalesOrgCode     : String(4);     // VKORG
type ProductCode      : String(40);    // MATNR
type CurrencyCode     : String(5);     // Código ISO de moeda
```

**Enumerações Principais:**

```cds
type OverallOrderStatus : String(1) enum {
    Open        = 'A';   // Novo pedido criado
    InProcess   = 'B';   // Submetido para processamento
    Completed   = 'C';   // Entregue e faturado
    NotRelevant = ' ';
};

type DeletionIndicator : String(1) enum {
    Active  = ' ';   // Pedido ativo
    Deleted = 'X';   // Marcado para exclusão lógica
};

type BusinessPartnerRole : String(2) enum {
    SoldToParty = 'AG';   // Cliente que fez o pedido
    ShipToParty = 'WE';   // Destino de entrega
    BillToParty = 'RE';   // Destino de faturamento
    Payer       = 'RG';   // Responsável pelo pagamento
};
```

#### 5.1.2 Aspectos Reutilizáveis (`db/aspects/domain-aspects.cds`)

Mixins que adicionam campos e semântica a entidades via `extend`. Evitam duplicação de definições.

```cds
// Adicionado a entidades que suportam exclusão lógica
aspect SoftDeletable {
    deletionIndicator : DeletionIndicator default ' ';
}

// Adicionado a entidades com campos financeiros
aspect Monetized {
    amount   : Decimal(15, 2) @Measures.ISOCurrency: currency;
    currency : Association to Currencies;
}

// Adicionado a SalesOrders — campos computados pelo handler
aspect StatusTracked {
    overallStatus  : OverallOrderStatus  @readonly @Core.Computed;
    deliveryStatus : DeliveryStatus      @readonly @Core.Computed;
    billingStatus  : BillingStatus       @readonly @Core.Computed;
}

// Rastreamento de eventos para deduplicação no Event Mesh
aspect EventEmitting {
    @UI.Hidden lastEventType : String(100) @readonly;
    @UI.Hidden lastEventAt   : Timestamp   @readonly;
}
```

#### 5.1.3 Agregado de Pedidos de Venda (`db/domain/sales-orders.cds`)

Este é o coração do domínio. Implementa o padrão **Aggregate Root** do DDD.

```
SalesOrders (raiz do agregado)
│
├── SalesOrderItems (Composition — ciclo de vida compartilhado)
│   ├── SalesOrderItemConditions (preços/condições — KONV)
│   ├── SalesOrderScheduleLines (datas/quantidades de entrega — VBEP)
│   └── SalesOrderItemTexts
│
├── SalesOrderPartners (Composition — parceiros de funções — VBPA)
│   └── Associações filtradas: soldTo, shipTo, billTo
│
└── SalesOrderHeaderTexts
```

**Entidade Raiz:**

```cds
entity SalesOrders : managed, cuid, SoftDeletable, StatusTracked, EventEmitting {
    // Chave de negócio (imutável após criação)
    salesOrder          : SalesOrderNumber @mandatory @assert.unique;

    // Classificação
    salesOrderType      : Association to SalesOrderTypes;
    salesArea           : Association to SalesAreas;

    // Datas
    orderDate           : Date @mandatory;
    requestedDelivDate  : Date;
    pricingDate         : Date;

    // Financeiro (calculado pelo handler)
    netAmount           : Decimal(15, 2) @readonly @Core.Computed;
    transactionCurrency : CurrencyCode;

    // Documento de referência
    purchaseOrderNumber : String(35);

    // Composições (entidades filhas — vida útil ligada ao pai)
    items    : Composition of many SalesOrderItems   on items.order = $self;
    partners : Composition of many SalesOrderPartners on partners.order = $self;
    texts    : Composition of many SalesOrderHeaderTexts on texts.order = $self;

    // Associações filtradas por função (conveniência)
    soldTo   : Association to SalesOrderPartners on soldTo.role = 'AG' and soldTo.order = $self;
    shipTo   : Association to SalesOrderPartners on shipTo.role = 'WE' and shipTo.order = $self;
    billTo   : Association to SalesOrderPartners on billTo.role = 'RE' and billTo.order = $self;
}
```

**Decisão chave — UUIDs como chave primária:**
- Todas as entidades usam `cuid` (UUID) como PK técnica.
- A chave de negócio (`salesOrder`, `itemNumber`) é separada com `@assert.unique`.
- Isso garanta FKs estáveis mesmo que o número do pedido seja renumerado.

**Parceiros (padrão VBPA):**

```cds
entity SalesOrderPartners {
    key order   : Association to SalesOrders;
    key role    : BusinessPartnerRole;

    partner_ID  : UUID;  // referência ao BusinessPartner
    partnerName : String(80);  // snapshot do nome (evita JOIN para exibição)
}
```

**Views analíticas:**

```cds
// Pedidos sem exclusão lógica
view ActiveSalesOrders as select from SalesOrders
    where deletionIndicator = ' ';

// Pedidos abertos (não totalmente entregues)
view OpenOrdersView as select from SalesOrders
    where deletionIndicator = ' '
      and deliveryStatus    != 'C';

// View desnormalizada para analytics (sem navegação OData)
view SalesOrderItemsFlat as select
    from SalesOrderItems as i left join SalesOrders as h on i.order_ID = h.ID {
        h.salesOrder, h.orderDate, h.netAmount as headerNetAmount,
        i.itemNumber, i.product.name as productName, i.orderQuantity, i.netAmount
    };
```

#### 5.1.4 Dados Mestres (`db/masterdata/master-data.cds`)

Entidades de suporte com ciclo de vida independente do agregado:

| Entidade | Equivalente S/4 | Campos Principais |
|---|---|---|
| `Products` | MARA/MAKT | code, name (localized), type, baseUnit |
| `BusinessPartners` | KNA1/LFA1 | code, name, country, blocked |
| `BusinessPartnerAddresses` | ADRC | partner_ID, street, city, country, isDefault |
| `SalesOrganizations` | TVKO | code, name, country |
| `SalesAreas` | TVKWZ | salesOrg, distChannel, division, name |
| `ProductPrices` | A004 | product_ID, priceType, amount, validFrom/To |

**Nota:** `Products.name` e `Products.description` são `localized` — o CAP gera automaticamente a tabela `_texts` para traduções multilíngues.

---

### 5.2 Serviços OData (`srv/services/sales-order-service.cds`)

O projeto expõe **três serviços OData v4** com responsabilidades distintas:

#### Serviço 1: SalesOrderService (`/api/orders`)

**Propósito:** CRUD transacional + ações de domínio.
**Roles:** `SalesProcessor`, `SalesManager`, `SalesAuditor`

```cds
service SalesOrderService @(path: '/api/orders')
    @(requires: ['SalesProcessor', 'SalesManager', 'SalesAuditor']) {

    @cds.redirection.target: true
    @odata.draft.enabled
    entity SalesOrders as projection on db.SalesOrders
        excluding { lastEventType, lastEventAt }
        actions {
            action submitOrder();
            action confirmDelivery(comment: String);
            action recalculatePricing();
            action logicalDelete(reason: String);
        };

    entity SalesOrderItems as projection on db.SalesOrderItems
        actions {
            action addToDelivery(deliveryBlock: Boolean);
        };

    // F4 helpers (somente leitura)
    @readonly entity Products         as projection on masterdata.Products;
    @readonly entity BusinessPartners as projection on masterdata.BusinessPartners;
}
```

**Ações de Domínio:**

| Ação | Transição de Estado | Regras de Negócio |
|---|---|---|
| `submitOrder()` | Overall: A → B | Requer ≥1 schedule line por item; parceiro sold-to não bloqueado |
| `confirmDelivery(comment)` | Delivery: A/B → C | Somente SalesManager; armazena comentário opcional |
| `recalculatePricing()` | — | Recalcula condições de preço, atualiza netAmount dos itens e cabeçalho |
| `logicalDelete(reason)` | DeletionIndicator: ` ` → X | Soft-delete em cascata (cabeçalho + itens); registra motivo |
| `addToDelivery(deliveryBlock)` | — | Ação no item; integração com WM/TM; emite evento |

#### Serviço 2: SalesCatalogService (`/api/catalog`)

**Propósito:** Dados mestres e de referência — somente leitura.
**Roles:** `CatalogReader`, `SalesProcessor`, `SalesManager`, `SalesAuditor`

Expõe: Products, BusinessPartners, SalesOrganizations, SalesAreas, DistributionChannels, Divisions, SalesOrderTypes, ConditionTypes, ScheduleLineCategories.

Todas as entidades são `@readonly`. Não há ações. Usado como fonte de F4 helps em UIs.

#### Serviço 3: SalesAnalyticsService (`/api/analytics`)

**Propósito:** Queries analíticas para SAC, Datasphere e agentes de IA.
**Roles:** `AnalyticsReader`, `SalesManager`, `SalesAuditor`

```cds
@Analytics.query: true  // Habilita $apply para agregações OData
@odata.maxpagesize: 1000
entity OpenOrdersQuery as projection on db.OpenOrdersView {
    @Analytics.Dimension salesOrder,
    @Analytics.Dimension orderDate,
    @Analytics.Dimension soldTo.partnerName as soldToName,
    @Analytics.Measure   netAmount
};
```

**Expõe as views planas** (`ItemsFlat`, `ScheduleLinesFlat`) — safe aqui porque não coexistem com as entidades transacionais.

`@odata.maxpagesize: 1000` está definido nas três entidades analíticas para evitar retorno irrestrito de dados.

#### Serviço 4: IntegrationService (`/api/integration`)

**Propósito:** Ciclo completo de importação de dados externos + marshalling de pedidos locais para formatos externos.
**Roles:** `SalesManager` (ações de import), `SalesAuditor` (leitura + marshal)

```
Entidades de leitura (shadow):
  ImportRuns          — log de auditoria de cada execução
  NorthwindOrders     — pedidos brutos importados do OData v4
  NorthwindOrderItems — itens brutos (OData $expand)
  NorthwindProducts   — produtos brutos (OData)
  RestProducts        — produtos brutos (REST/JSON)
  LocalOrders         — projeção somente-leitura dos SalesOrders locais

Ações (SalesManager):
  importFromNorthwind(maxOrders)          → ImportSummary
  importFromRest(maxProducts)             → ImportSummary
  importAll(maxOrders, maxProducts)       → ImportSummary

Funções (SalesManager + SalesAuditor):
  marshalOrderToOData(orderID)  → MarshalResult (payload JSON com anotações OData)
  marshalOrderToRest(orderID)   → MarshalResult (payload JSON flat REST)
```

---

### 5.3 Handlers de Vendas (`srv/handlers/`)

O handler foi refatorado seguindo o **Single Responsibility Principle** em três arquivos:

#### `sales-order-service.ts` — Thin Orchestrator

```typescript
export default class SalesOrderService extends cds.ApplicationService {
    private validator:    SalesOrderValidator
    private stateMachine: StatusMachine
    private publisher:    EventPublisher

    async init(): Promise<void> {
        await super.init()
        if (!this.entities['SalesOrders']) return  // guard para serviços irmãos
        this.validator    = new SalesOrderValidator(this.entities)
        this.stateMachine = new StatusMachine()
        this.publisher    = new EventPublisher()
        new OrderHeaderHandler(this, this.entities, this.validator, this.stateMachine, this.publisher).register()
        new OrderItemHandler(this, this.entities, this.publisher).register()
    }
}
```

#### `order-header-handler.ts` — Hooks do Cabeçalho

Recebe o service via construtor e registra todos os hooks relativos a `SalesOrders`:

```
before DELETE  SalesOrders  → rejeita DELETE físico (HTTP 405)
before UPDATE  SalesOrders  → guardLogicallyDeleted()
before CREATE  SalesOrders  → validateNewOrder()
after  CREATE  SalesOrders  → afterOrderCreated() [emite evento]

on  submitOrder         → onSubmitOrder()
on  confirmDelivery     → onConfirmDelivery()
on  recalculatePricing  → onRecalculatePricing()
on  logicalDelete       → onLogicalDelete()
```

#### `order-item-handler.ts` — Hooks dos Itens

Registra hooks relativos a `SalesOrderItems`:

```
after  CREATE  SalesOrderItems → recomputeHeaderNetAmount()
after  UPDATE  SalesOrderItems → recomputeHeaderNetAmount()
before DELETE  SalesOrderItems → captureItemOrderID()
after  DELETE  SalesOrderItems → recomputeHeaderNetAmountAfterDelete()

on  addToDelivery  → onAddToDelivery()
```

**Vantagem do padrão sub-handler com `register()`:** os hooks são registrados na mesma instância do service sem herança, preservando a ordem de registro e sem violar o `@requires` do CAP.

**Invariantes do Agregado:**

| # | Regra | Onde Verificada |
|---|---|---|
| 1 | `netAmount` do cabeçalho = Σ `netAmount` dos itens | `recomputeHeaderNetAmountAfterItemChange` |
| 2 | `submitOrder` requer ≥1 schedule line por item | `onSubmitOrder` + `SalesOrderValidator` |
| 3 | Status são computados (nunca patcheados diretamente) | `@readonly @Core.Computed` no CDS |
| 4 | Pedidos excluídos rejeitam UPDATE | `guardLogicallyDeleted` |
| 5 | Parceiro sold-to deve existir e não estar bloqueado | `onSubmitOrder` + `assertPartnerNotBlocked` |

**Cálculo de Condições (`_computeConditionValue`):**

```typescript
private _computeConditionValue(
    type: ConditionCalcType,
    rate: number,
    qty: number,
    base: number
): number {
    switch (type) {
        case 'A': return (qty * rate) / 100;           // Percentual
        case 'B': return (qty / base) * rate;          // Por quantidade
        case 'C': return rate;                         // Valor fixo
        default:  return 0;
    }
}
```

---

### 5.4 Validações (`srv/lib/validations.ts`)

```typescript
export class SalesOrderValidator {
    constructor(private entities: Record<string, EntityDefinition>) {}

    // Validações pré-CREATE
    async validateNewOrder(data: Partial<SalesOrder>, req: Request): Promise<void> {
        // Regra 1: Data de entrega >= data do pedido
        if (data.requestedDelivDate && data.orderDate) {
            if (data.requestedDelivDate < data.orderDate) {
                req.error(422, 'ERR_DELVDATE_BEFORE_ORDDATE');
            }
        }
        // Regra 2: Parceiro sold-to não pode estar bloqueado
        if (data.soldTo?.partner_ID) {
            await this.assertPartnerNotBlocked(data.soldTo.partner_ID, req);
        }
    }

    // Busca itens sem schedule lines (O(2) queries — não N+1)
    async findItemsMissingScheduleLines(orderID: string): Promise<number[]> {
        const items = await SELECT.from(SalesOrderItems).where({ order_ID: orderID });
        const withLines = await SELECT.from(SalesOrderScheduleLines)
            .where({ item_ID: { in: items.map(i => i.ID) } });
        const itemsWithLines = new Set(withLines.map(l => l.item_ID));
        return items
            .filter(i => !itemsWithLines.has(i.ID))
            .map(i => i.itemNumber);
    }
}
```

---

### 5.5 Máquina de Estados (`srv/lib/status-machine.ts`)

Encapsula todas as regras de transição de status. **Fonte única da verdade** para lógica de estado.

```
Overall Status:
    A (Open) ──────────────────→ B (InProcess) ──→ C (Completed) [terminal]

Delivery Status:
    A (NotDelivered) ──→ B (PartiallyDelivered) ──→ C (FullyDelivered) [terminal]
    A ──────────────────────────────────────────────→ C

Billing Status: (mesmas transições que Delivery)
```

```typescript
export class StatusMachine {
    // Regra: C apenas se entrega E faturamento estiverem completos
    computeOverallStatus(
        deliveryStatus: DeliveryStatus,
        billingStatus: BillingStatus
    ): OverallOrderStatus {
        if (deliveryStatus === 'C' && billingStatus === 'C') return 'C'; // Completed
        if (deliveryStatus !== 'A' || billingStatus !== 'A') return 'B'; // InProcess
        return 'A'; // Open
    }

    canTransitionOverall(from: OverallOrderStatus, to: OverallOrderStatus): boolean {
        const allowed: Record<string, string[]> = {
            'A': ['B'],
            'B': ['C'],
            'C': []   // terminal
        };
        return allowed[from]?.includes(to) ?? false;
    }

    // Labels legíveis para cada código de status
    deliveryStatusLabel(status: DeliveryStatus): string { ... }
    billingStatusLabel(status: BillingStatus): string {
        const labels: Record<BillingStatus, string> = {
            'A': 'Not Billed',
            'B': 'Partially Billed',
            'C': 'Fully Billed',
            ' ': 'Not Relevant'
        }
        return labels[status] ?? status
    }
}
```

`billingStatusLabel` foi adicionado para simetria com `deliveryStatusLabel` (que já existia). Os três métodos `*Label` são a fonte única de rótulos de status para UI.

---

### 5.6 Publicação de Eventos (`srv/lib/events.ts`)

Publica eventos de domínio no SAP Event Mesh seguindo o padrão **CloudEvents 1.0**.

```typescript
export class EventPublisher {
    // Tipos de eventos suportados
    static readonly TYPES = {
        CREATED:   'com.my.sales.salesorder.created.v1',
        SUBMITTED: 'com.my.sales.salesorder.submitted.v1',
        DELIVERED: 'com.my.sales.salesorder.delivered.v1',
        DELETED:   'com.my.sales.salesorder.deleted.v1',
        ITEM_ADDED:'com.my.sales.salesorder.item.added.v1',
    };

    async publish(type: string, data: EventPayload, subjectID: string): Promise<void> {
        const messaging = await this._getMessaging();
        if (!messaging) return;  // No-op em desenvolvimento

        const event = {
            specversion:     '1.0',
            type,
            source:          '/com/my/sales/salesorder',
            subject:         subjectID,
            datacontenttype: 'application/json',
            time:            new Date().toISOString(),
            data
        };

        // Emite via CAP Outbox — atômico com a transação de banco
        await messaging.emit(type, event);
    }
}
```

**Padrão de tópico no Event Mesh:** `com/my/sales/salesorder/+/v1`

**Consumidores típicos:**
- CPI iFlows (integração com WM/TM)
- SAP Build Process Automation (workflows de aprovação)

---

### 5.7 Tipos TypeScript (`srv/types/domain.ts`)

Interfaces TypeScript definidas manualmente, complementando os tipos gerados automaticamente em `@cds-models/`. Úteis como referência e para cenários onde os tipos gerados ainda não estão disponíveis.

```typescript
export interface SalesOrder {
    ID?:                 string;
    salesOrder:          string;
    orderDate:           string;
    requestedDelivDate?: string;
    netAmount?:          number;
    overallStatus?:      OverallOrderStatus;
    deliveryStatus?:     DeliveryStatus;
    deletionIndicator?:  DeletionIndicator;
    items?:              SalesOrderItem[];
    partners?:           SalesOrderPartner[];
}

export interface SalesOrderItem {
    ID?:            string;
    order_ID?:      string;
    itemNumber:     number;
    product_ID?:    string;
    orderQuantity:  number;
    netAmount?:     number;
    conditions?:    SalesOrderItemCondition[];
    scheduleLines?: SalesOrderScheduleLine[];
}
```

---

### 5.8 Entidades Shadow (`db/integration/northwind-shadow.cds`)

Namespace `com.my.sales.integration`. Armazena dados brutos importados **antes** de qualquer transformação de domínio.

| Entidade | Chave Externa | Campos Adicionais | Link ao Domínio |
|---|---|---|---|
| `ImportRuns` | UUID (cuid) | source, status, startedAt/completedAt, recordsImported, errorMessage | — |
| `NorthwindOrders` | `northwindOrderID` (Int) | todos os campos OData + `freightConverted`, `convertedCurrency`, `conversionRate` | `localOrder_ID : UUID` |
| `NorthwindOrderItems` | `northwindOrderID` + `northwindProductID` | unitPrice, quantity, discount, `lineTotal` | `localItem_ID : UUID` |
| `NorthwindProducts` | `northwindProductID` (Int) | todos os campos OData + `localProductCode` | `localProduct_ID : UUID` |
| `RestProducts` | `externalID` (Int) | title, description, price, discountPct, rating, stock, brand, category + `localProductCode` | `localProduct_ID : UUID` |

**Princípios de design:**
- **Originais intactos** — cada campo do sistema externo é armazenado sem modificação.
- **Links fracos** — `localOrder_ID`, `localProduct_ID` são UUIDs nullable (sem FK rígida), setados após a transformação ser concluída.
- **Idempotência** — todas as escritas usam `UPSERT` keyed na chave externa, tornando qualquer reimport seguro.

---

### 5.9 Camada de Integração (`srv/integration/`)

#### `types.ts` — Contratos de wire format

```typescript
// OData v4: envelope value[] com @odata.context
interface ODataCollectionResponse<T> { '@odata.context': string; value: T[] }
interface NwOrder { OrderID: number; CustomerID?: string; Freight?: number; Order_Details?: NwOrderDetail[]; ... }

// REST/JSON: array nomeado, sem envelope
interface DummyJsonProductsResponse { products: DummyJsonProduct[]; total: number; skip: number; limit: number }
```

#### `http-client.ts` — Abstração de transporte HTTP

```typescript
interface HttpClient { get<T>(url: string, headers?: Record<string,string>): Promise<HttpResponse<T>> }

class AxiosHttpClient implements HttpClient { ... }  // produção — timeout 15s, structured logging

class MockHttpClient implements HttpClient {
    register(urlPattern: string, data: unknown): void  // String.includes() matching
    get<T>(url: string): Promise<HttpResponse<T>>      // lança HttpError se padrão não encontrado
}
```

O `MockHttpClient` permite injetar respostas nos testes **sem** usar `jest.mock()` de módulos. Basta setar `IntegrationService.httpClient = mock` antes de `cds.test()` inicializar o servidor.

#### `marshallers.ts` — Núcleo didático

O arquivo mais importante da camada de integração. Demonstra explicitamente todas as conversões de tipo entre formatos.

**Conversões OData → CDS (unmarshal):**

| Campo OData | Tipo OData | Campo CDS | Tipo CDS | Transformação |
|---|---|---|---|---|
| `OrderDate` | DateTimeOffset | `orderDate` | Date | `"1996-07-04T00:00:00Z"` → `"1996-07-04"` |
| `Freight` | Decimal(10,4) USD | `freightConverted` | Decimal(14,4) EUR | `× USD_EUR_RATE (0.92)` |
| `Discount` | Single (float) | `discount` | Decimal(7,4) | armazenado como-está |
| `UnitPrice × Quantity × (1-Discount)` | — | `lineTotal` | Decimal(14,4) | calculado, arredondado 4 dp |
| `OrderID` | Int | `salesOrder` | String(10) | `"NW-${OrderID}"` |
| `ProductID` | Int | `code` | String(40) | `"NW-${padStart(4,'0')}"` |

**Conversões REST → CDS (unmarshal):**

| Campo REST | Campo CDS | Nota |
|---|---|---|
| `id` | `externalID` | camelCase → local |
| `title` | `title` | sem renomear (REST convention) |
| `discountPercentage` | `discountPct` | renomeado para clareza |
| `brand` (pode ser `undefined`) | `brand` | `undefined → null` para o banco |
| `id` | `localProductCode` | `"REST-${id}"` |

**Conversões CDS → OData (marshal):**

```typescript
// Date "1996-07-04" → DateTimeOffset "1996-07-04T00:00:00Z"
// camelCase → PascalCase: orderDate → OrderDate, netAmount → NetAmount
// Adiciona @odata.context e @odata.type por entidade
```

**Conversões CDS → REST (marshal):**

```typescript
// Sem @odata.context nem @odata.type
// UUID como `id` (camelCase REST convention)
// Campos camelCase mantidos
```

#### `import-orchestrator.ts` — Coordenação do ciclo completo

```
importFromNorthwind(maxOrders):
  1. INSERT ImportRun (status='running')
  2. fetchOrders + fetchProducts em paralelo (Promise.all)
  3. Para cada produto: UPSERT NorthwindProducts + UPSERT local Products
  4. Para cada pedido: UPSERT NorthwindOrders + UPSERT local SalesOrders + items
  5. UPDATE ImportRun (status='completed', recordsImported=N)
  Se falhar: UPDATE separado (status='failed', errorMessage)

importFromRest(maxProducts):
  1. INSERT ImportRun (status='running')
  2. fetchProducts REST
  3. Para cada produto: UPSERT RestProducts + UPSERT local Products
  4. UPDATE ImportRun (status='completed')
```

**Nota de transação:** usa `this.db.run()` diretamente (sem `cds.tx()` aninhado). O SQLite em modo single-connection entra em deadlock com transações aninhadas. A atomicidade é provida pela transação outer do handler CAP; o UPSERT garante idempotência.

#### `integration-service.ts` (handler) — Thin dispatcher

```typescript
export default class IntegrationService extends cds.ApplicationService {
    static httpClient: HttpClient | null = null  // ponto de injeção para testes
    private orchestrator!: ImportOrchestrator

    async init(): Promise<void> {
        await super.init()
        if (!this.entities['ImportRuns']) return  // guard para serviços irmãos
        const http = IntegrationService.httpClient ?? new AxiosHttpClient()
        // ... registra on('importFromNorthwind', ...) etc.
    }
}
```

**Injeção de mock no teste:**
```typescript
// Deve ocorrer ANTES de cds.test() registrar seu beforeAll
IntegrationService.httpClient = mockClient  // linha de módulo, não dentro de describe
const { POST, GET } = cds.test(__dirname + '/..')
```

**Regra de descoberta de handler do CAP:** o arquivo `.ts` do handler deve ter **exatamente o mesmo nome e path** que o arquivo `.cds` do serviço. Por isso `srv/services/integration-service.ts` re-exporta o handler de `srv/handlers/integration-service.ts`.

---

## 6. Fluxos de Execução

### 6.1 Inicialização da Aplicação

```
npm run dev  (ou cds-serve)
      │
      ▼
[1] CAP carrega package.json → lê seção "cds"
      │
      ▼
[2] Compila modelos CDS (db/ + srv/)
    └── Gera metadata OData $metadata
    └── Resolve associações e composições
      │
      ▼
[3] Conecta ao banco de dados
    └── Dev: SQLite (./db/data/sales-orders.db)
    └── Prod: SAP HANA Cloud (via binding)
      │
      ▼
[4] Descobre e carrega handlers TypeScript
    └── srv/sales-order-service.ts → SalesOrderService.init()
    └── Registra hooks before/on/after
      │
      ▼
[5] Inicia servidor HTTP (Express under the hood)
    └── /api/orders    → SalesOrderService
    └── /api/catalog   → SalesCatalogService
    └── /api/analytics   → SalesAnalyticsService
    └── /api/integration → IntegrationService
    └── /$metadata       → OData metadata documents
```

### 6.2 Fluxo de uma Requisição OData

**Exemplo: `POST /api/orders/SalesOrders` (criar pedido)**

```
Cliente
  │ POST /api/orders/SalesOrders
  │ Authorization: Bearer <JWT>
  │ { "salesOrder": "0000000001", "orderDate": "2024-01-15", ... }
  ▼
[1] Middleware XSUAA — valida JWT, extrai scopes
    └── Verifica scope SalesProcessor ou SalesManager
    └── req.user = { id: 'alice', roles: ['SalesProcessor'] }
  │
  ▼
[2] CAP Runtime — valida OData payload, gera UUID (cuid)
  │
  ▼
[3] Hook: before CREATE SalesOrders
    └── SalesOrderHandler.validateNewOrder(data, req)
        ├── Verifica requestedDelivDate >= orderDate
        └── Se soldTo presente: assertPartnerNotBlocked()
  │
  ▼
[4] CAP persiste no banco (INSERT INTO SalesOrders ...)
  │
  ▼
[5] Hook: after CREATE SalesOrders
    └── SalesOrderHandler.afterOrderCreated(req)
        └── EventPublisher.publish('...created.v1', data, orderID)
            └── CAP Outbox persiste evento (atômico com [4])
  │
  ▼
[6] Resposta HTTP 201 Created
    { "@odata.context": "...", "ID": "uuid", "salesOrder": "0000000001", ... }
```

### 6.3 Fluxo da Ação `submitOrder`

```
POST /api/orders/SalesOrders('uuid')/submitOrder

[1] CAP roteia para SalesOrderHandler.onSubmitOrder(req)
  │
[2] Busca pedido com items e partners
  │
[3] Valida estado atual (overallStatus deve ser 'A' — Open)
    └── statusMachine.canTransitionOverall('A', 'B') → true
  │
[4] Validator: findItemsMissingScheduleLines(orderID)
    └── Se retornar array não vazio → req.error(422, ...)
  │
[5] Validator: assertPartnerNotBlocked(soldToID, req)
    └── SELECT from BusinessPartners where ID = soldToID
    └── Se blocked = true → req.error(422, ...)
  │
[6] Atualiza status no banco
    UPDATE SalesOrders SET overallStatus = 'B' WHERE ID = 'uuid'
  │
[7] EventPublisher.publish('...submitted.v1', ...)
  │
[8] Resposta 200 OK com entidade atualizada
```

### 6.4 Fluxo de Importação (`importFromNorthwind`)

```
POST /api/integration/IntegrationService.importFromNorthwind
Body: { "maxOrders": 5 }
Auth: bob (SalesManager)

[1] CAP verifica @restrict: [{ to: 'SalesManager' }] → OK
  │
[2] IntegrationService.onImportFromNorthwind(req)
  │
[3] ImportOrchestrator.importFromNorthwind(5)
    ├── INSERT ImportRuns (status='running')
    ├── Promise.all([
    │     NorthwindClient.fetchOrders(5)   → GET /Orders?$top=5&$expand=Order_Details&...
    │     NorthwindClient.fetchProducts(25) → GET /Products?$top=25&...
    │   ])
    │     ↓ MockHttpClient (testes) ou AxiosHttpClient (produção)
    │
    ├── Para cada produto:
    │   ├── unmarshalNwProduct(raw) → { shadow, localCode, localName }
    │   ├── UPSERT NorthwindProducts  (shadow + importRun_ID)
    │   ├── SELECT/INSERT Products    (localCode, localName)
    │   └── UPDATE NorthwindProducts SET localProduct_ID = uuid
    │
    ├── Para cada pedido:
    │   ├── unmarshalNwOrder(raw) → { shadow, itemShadows, localOrder, localItems }
    │   ├── UPSERT NorthwindOrders  (shadow + importRun_ID)
    │   ├── SELECT/INSERT SalesOrders
    │   ├── UPDATE NorthwindOrders SET localOrder_ID = uuid
    │   └── Para cada item:
    │       ├── UPSERT NorthwindOrderItems
    │       ├── SELECT Products WHERE code = localItem.productCode
    │       └── SELECT/INSERT/UPDATE SalesOrderItems
    │
    └── UPDATE ImportRuns SET status='completed', recordsImported=N

[4] _toSummary(result) → { runID, source, status, ordersImported, ... }

[5] HTTP 200 OK  { "runID": "...", "ordersImported": 5, ... }
```

### 6.5 Comunicação Entre Módulos

```
SalesOrderService (thin orchestrator)
    ├──instancia──→ OrderHeaderHandler.register()
    │                   ├──uses──→ SalesOrderValidator
    │                   ├──uses──→ StatusMachine
    │                   └──uses──→ EventPublisher
    └──instancia──→ OrderItemHandler.register()
                        └──uses──→ EventPublisher

IntegrationService (thin dispatcher)
    └──instancia──→ ImportOrchestrator
                        ├──uses──→ NorthwindClient
                        │              └──uses──→ HttpClient (Axios / Mock)
                        ├──uses──→ RestClient
                        │              └──uses──→ HttpClient (Axios / Mock)
                        └──uses──→ marshallers (unmarshal/marshal)

EventPublisher
    └──emits via──→ CAP Outbox
                        └──→ SAP Event Mesh (prod)
                                └──→ Subscribers (CPI, Build Process Automation)
```

### 6.6 Diagrama de Sequência — Ciclo de Vida do Pedido

```
Estado:  [Criado]──submitOrder──→[Em Processo]──confirmDelivery──→[Concluído]
             │                        │                                │
             │                   [Active]                         [Delivered]
             │
         logicalDelete
             │
         [Excluído Logicamente] ← (sem retorno possível)
```

---

## 7. Como Executar o Projeto

### 7.1 Pré-requisitos

| Requisito | Versão Mínima | Verificação |
|---|---|---|
| Node.js | 20+ | `node --version` |
| npm | 9+ | `npm --version` |
| SAP CAP CLI | — | `npm install -g @sap/cds-dk` |

Para deploy em produção (SAP BTP):
- Cloud Foundry CLI (`cf`)
- MTA Build Tool (`mbt`)
- Acesso a uma subaccount SAP BTP com serviços HANA, XSUAA e Event Mesh

### 7.2 Instalação

```bash
# 1. Clonar o repositório
git clone <repo-url>
cd cap-salesorder-ts-learning

# 2. Instalar dependências
npm install

# 3. (Opcional) Gerar tipos TypeScript a partir dos modelos CDS
npm run typegen
```

### 7.3 Execução em Desenvolvimento

```bash
# Inicia o servidor com live reload
npm run dev
```

O servidor ficará disponível em `http://localhost:4004` com:
- `http://localhost:4004/api/orders` — SalesOrderService
- `http://localhost:4004/api/catalog` — SalesCatalogService
- `http://localhost:4004/api/analytics` — SalesAnalyticsService
- `http://localhost:4004/api/integration` — IntegrationService
- `http://localhost:4004/$metadata` — Metadata OData de cada serviço

**Autenticação em desenvolvimento:** Use os usuários mockados:
```
alice / alice  → SalesProcessor
bob   / bob    → SalesManager
charlie / charlie → SalesAuditor
```

### 7.4 Exemplos de Requisições

```bash
# Criar pedido (como alice — SalesProcessor)
curl -u alice:alice -X POST http://localhost:4004/api/orders/SalesOrders \
  -H "Content-Type: application/json" \
  -d '{ "salesOrder": "0000000001", "orderDate": "2024-01-15" }'

# Listar pedidos (como charlie — SalesAuditor)
curl -u charlie:charlie http://localhost:4004/api/orders/SalesOrders

# Submeter pedido (como bob — SalesManager)
curl -u bob:bob -X POST \
  "http://localhost:4004/api/orders/SalesOrders('PEDIDO_ID')/submitOrder"

# Listar produtos no catálogo
curl -u alice:alice http://localhost:4004/api/catalog/Products

# Query analítica com agregação OData $apply
curl -u charlie:charlie \
  "http://localhost:4004/api/analytics/OpenOrdersQuery?\$apply=groupby((soldToName),aggregate(netAmount with sum as totalRevenue))"

# Importar pedidos do Northwind OData v4 (como bob — SalesManager)
curl -u bob:bob -X POST http://localhost:4004/api/integration/IntegrationService.importFromNorthwind \
  -H "Content-Type: application/json" \
  -d '{ "maxOrders": 5 }'

# Importar produtos do dummyjson.com REST API
curl -u bob:bob -X POST http://localhost:4004/api/integration/IntegrationService.importFromRest \
  -H "Content-Type: application/json" \
  -d '{ "maxProducts": 10 }'

# Serializar pedido local como OData v4
curl -u bob:bob \
  "http://localhost:4004/api/integration/marshalOrderToOData(orderID=UUID_DO_PEDIDO)"

# Consultar log de auditoria de importações
curl -u charlie:charlie http://localhost:4004/api/integration/ImportRuns
```

### 7.5 Build para Produção

```bash
# Verificação de tipos TypeScript (sem emissão)
npm run build

# Build completo dos artefatos CAP (HANA DDL, metadata OData)
# (executado internamente pelo npm run build via cds build --production)
ls gen/   # → db/, srv/, package.json, etc.
```

### 7.6 Deploy no SAP BTP

```bash
# Build do arquivo MTA
mbt build

# Deploy com estratégia blue-green (zero downtime)
cf deploy mta_archives/cap-salesorder-ts_1.0.0.mtar --strategy blue-green

# Deploy simples (com downtime)
cf deploy mta_archives/cap-salesorder-ts_1.0.0.mtar
```

---

## 8. Testes

### 8.1 Estrutura dos Testes

```
test/
├── setup-env.ts                    # Define CDS_TYPESCRIPT=true antes do CAP iniciar
├── sales-order-service.test.ts     # Suíte de vendas
│   ├── describe('StatusMachine')   # Testes unitários — sem CAP runtime
│   │   ├── computeOverallStatus()
│   │   ├── canTransitionOverall()
│   │   ├── deliveryStatusLabel()
│   │   └── billingStatusLabel()    # adicionado
│   │
│   └── describe('SalesOrderService HTTP API')  # Testes de integração
│       ├── POST SalesOrders (create)
│       ├── DELETE SalesOrders (blocked — returns 405)
│       ├── POST submitOrder
│       ├── POST confirmDelivery
│       ├── POST logicalDelete
│       ├── POST recalculatePricing
│       ├── GET SalesOrders (read)
│       └── Instance-based auth — SalesProcessor (alice)  # adicionado
│
└── integration-service.test.ts     # Suíte de integração
    ├── describe('Marshallers — unit')   # Testes puramente unitários
    │   ├── unmarshalNwOrderDetail       # lineTotal, discount, campos raw
    │   ├── unmarshalNwOrder             # datas, freight EUR, salesOrder number, items
    │   ├── unmarshalNwProduct           # código NW-XXXX, Discontinued
    │   ├── unmarshalRestProduct         # mapeamento camelCase, undefined→null
    │   ├── marshalOrderToOData          # anotações, PascalCase, DateTimeOffset
    │   ├── marshalOrderToRest           # sem anotações, camelCase, UUID como id
    │   └── MockHttpClient               # pattern matching, HttpError
    │
    └── describe('IntegrationService HTTP API')  # Testes de integração
        ├── importFromNorthwind — SalesManager pode importar
        ├── importFromNorthwind — SalesAuditor é proibido
        ├── importFromRest — ciclo REST completo
        ├── ImportRuns — log criado após cada import
        ├── NorthwindOrders — shadow populado após import
        ├── LocalOrders — SalesOrder NW-99901 upsertado
        ├── marshalOrderToOData — payload com anotações OData
        └── marshalOrderToRest — payload flat sem anotações
```

**Total: 76 testes, todos passando.**

### 8.2 Como Executar os Testes

```bash
# Executar todos os testes
npm test

# Modo watch (re-executa ao salvar arquivos)
npm run test:watch

# Com relatório de cobertura
npm test -- --coverage

# Executar um teste específico
npm test -- --testNamePattern="submitOrder"
```

### 8.3 Framework e Ferramentas

| Ferramenta | Versão | Papel |
|---|---|---|
| Jest | 29+ | Runner de testes e assertions |
| ts-jest | 29+ | Compilação TypeScript para Jest |
| `@cap-js/cds-test` | ^0.4.1 | `cds.test()` — sobe servidor CAP contra SQLite in-memory |
| `@cap-js/sqlite` | ^2.2 | Banco in-memory para testes isolados |

### 8.4 Anatomia de um Teste de Integração

```typescript
import cds from '@sap/cds';

// Sobe o servidor CAP completo contra SQLite in-memory
const { axios } = cds.test(__dirname + '/..');

describe('SalesOrderService HTTP API', () => {
    let orderID: string;

    beforeEach(async () => {
        // Cria um pedido limpo antes de cada teste
        const res = await axios.post('/api/orders/SalesOrders',
            { salesOrder: `ORD-${Date.now()}`, orderDate: '2024-01-15' },
            { auth: { username: 'alice', password: 'alice' } }
        );
        orderID = res.data.ID;
    });

    it('SalesProcessor can create an order', async () => {
        expect(res.status).toBe(201);
        expect(res.data.overallStatus).toBe('A');
    });

    it('submitOrder rejects if no schedule lines', async () => {
        const res = await axios.post(
            `/api/orders/SalesOrders('${orderID}')/submitOrder`,
            {},
            { auth: { username: 'bob', password: 'bob' }, validateStatus: () => true }
        );
        expect(res.status).toBe(422);
    });
});
```

### 8.5 Thresholds de Cobertura

| Métrica | Mínimo |
|---|---|
| Branches | 70% |
| Functions | 80% |
| Lines | 80% |
| Statements | 80% |

### 8.6 Adicionando Novos Testes

**Para testes unitários** (lógica pura sem banco):
```typescript
import { StatusMachine } from '../srv/lib/status-machine';

test('nova regra de transição', () => {
    const sm = new StatusMachine();
    expect(sm.canTransitionOverall('A', 'C')).toBe(false); // pular B é inválido
});
```

**Para testes de integração** (com banco):
```typescript
it('deve rejeitar pedido duplicado', async () => {
    // Arrange: cria o pedido
    await axios.post('/api/orders/SalesOrders', { salesOrder: '0000000001', ... });

    // Act: tenta criar com mesmo número
    const res = await axios.post('/api/orders/SalesOrders',
        { salesOrder: '0000000001', ... },
        { validateStatus: () => true }
    );

    // Assert
    expect(res.status).toBe(409); // Conflict — unique constraint
});
```

---

## 9. Boas Práticas e Padrões Arquiteturais

### 9.1 Domain-Driven Design (DDD)

| Conceito DDD | Implementação |
|---|---|
| **Bounded Context** | Namespace `com.my.sales` — todo domínio de vendas encapsulado |
| **Aggregate Root** | `SalesOrders` — único ponto de acesso a items, partners, texts |
| **Composition** | `items`, `partners`, `texts` — ciclo de vida atrelado ao pai |
| **Association** | `product`, `businessPartner`, `salesArea` — ciclo de vida independente |
| **Value Objects** | Tipos como `SalesOrderNumber`, enums — imutáveis, sem identidade própria |
| **Domain Events** | CloudEvents publicados após cada ação de domínio |
| **Repository** | CAP CQL abstrai o acesso ao banco (sem SQL direto) |

### 9.2 Padrão de Três Serviços

```
SalesOrderService  → Transacional (escrita + leitura com draft)
SalesCatalogService → Referência (somente leitura, F4 helps)
SalesAnalyticsService → Analítico ($apply, dimensions, measures)
```

Esta separação evita misturar semânticas incompatíveis (draft vs. read-only vs. $apply) no mesmo serviço.

### 9.3 Clean Core

- **Nunca modificar** entidades ou tabelas SAP padrão.
- Integração com S/4HANA via **CPI iFlows** (não RFC/BAPI direto).
- Namespace customizado `com.my.sales` — sem conflito com namespace SAP.
- Extensões via projetos **side-by-side**.

### 9.4 Soft Delete Obrigatório

```typescript
// ❌ DELETE físico bloqueado no handler
this.before('DELETE', SalesOrders, req => {
    req.error(405, 'Physical DELETE is not allowed. Use logicalDelete action.');
});

// ✅ Apenas exclusão lógica via ação de domínio
action logicalDelete(reason: String);
```

**Razão:** Conformidade com regulamentações de auditoria (GDPR, SOX) e rastreabilidade.

### 9.5 Chaves Substitutas UUID

- **PK técnica:** `ID` (UUID via `cuid`) — estável, usada nas FKs.
- **Chave de negócio:** `salesOrder` — visível ao usuário, com `@assert.unique`.
- **Vantagem:** Se o número do pedido precisar ser renumerado (cenário raro mas real), as FKs técnicas não quebram.

### 9.6 Atomicidade com CAP Outbox

```
SalesOrder INSERT   ─┐
EventPublisher.emit ─┤ → mesma transação HANA
CAP Outbox persist  ─┘

Evento enviado ao Event Mesh: assíncrono, com retry automático
```

Garante que nenhum evento seja perdido mesmo se o Event Mesh estiver temporariamente indisponível.

### 9.7 Single Source of Truth para Status

Toda lógica de transição de status está em `StatusMachine`. Não há guards duplicados em outros lugares. Se uma nova regra surgir, há apenas um arquivo para modificar.

### 9.8 Views Planas em Serviço Separado

`SalesOrderItemsFlat` e `ScheduleLinesFlat` são expostas **apenas** em `SalesAnalyticsService`, nunca junto com as entidades transacionais. Isso evita o erro de "redirect ambiguity" do CAP e mantém semântica clara.

---

## 10. Possíveis Melhorias

### 10.1 Melhorias Arquiteturais

| # | Melhoria | Justificativa |
|---|---|---|
| 1 | **CQRS explícito** | Separar ainda mais handlers de leitura e escrita em classes distintas — `SalesOrderCommandHandler` e `SalesOrderQueryHandler` | 
| 2 | **Event Sourcing** | Armazenar todos os eventos de domínio como sequência imutável (não apenas o estado atual) para auditoria completa |
| 3 | **Saga Pattern** | Para operações multi-serviço (ex: criação de pedido + reserva de estoque), usar Saga Orchestrator via CAP Outbox |
| 4 | **Multi-tenancy** | Habilitar `@sap/cds-mtxs` para suportar múltiplos tenants com isolamento de dados |
| 5 | **Change Tracking** | ✅ implementado | `@ChangeTracking` em `SalesOrders` — histórico de alterações via `@cap-js/change-tracking` |
| 6 | **Audit Logging GDPR** | ✅ implementado | `@PersonalData` em `BusinessPartners`, `BusinessPartnerAddresses`, `SalesOrderPartners` |
| 7 | **Messaging bidirecional** | ✅ implementado | `EventConsumerHandler` consome `wms/delivery/confirmed/v1` e `tms/shipment/dispatched/v1` |

### 10.2 Otimizações de Código

| # | Melhoria | Status | Impacto |
|---|---|---|---|
| 1 | **Batch pricing** | pendente | `recalculatePricing` já usa 3 writes em batch; avaliar uso de `cds.run([...])` para atomicidade explícita |
| 2 | **Cache de dados mestres** | pendente | BusinessPartners e Products raramente mudam — adicionar cache com TTL para reduzir queries |
| 3 | **Paginação em views analíticas** | ✅ implementado | `@odata.maxpagesize: 1000` adicionado às 3 entidades analíticas |
| 4 | **Índices HANA** | pendente | Adicionar índices em `salesOrder`, `orderDate`, `deletionIndicator` nas tabelas HANA para performance |
| 5 | **SELECT.forUpdate()** | ✅ implementado | Lock pessimista em `submitOrder`, `confirmDelivery` e `logicalDelete` (WAIT 5s) |
| 6 | **Remote Service declarativo** | ✅ implementado | `srv/external/northwind.cds` + `northwind-remote-client.ts` com CQL idêntico a entidade local |
| 7 | **Custom REST endpoints** | ✅ implementado | `GET /api/orders/health` e `POST /api/orders/delivery-webhook` no `OrderHeaderHandler` |

### 10.3 Melhorias de Organização

| # | Melhoria | Status | Justificativa |
|---|---|---|---|
| 1 | **Separar handlers por entidade** | ✅ implementado | `OrderHeaderHandler` + `OrderItemHandler` com padrão `register()` |
| 2 | **Seed data versionado** | pendente | Mover dados de `db/data/` para scripts de migration versionados |
| 3 | **Feature flags** | pendente | Para novos comportamentos em produção, usar configuração via `cds.env` em vez de código condicional |

### 10.4 Melhorias de Documentação

| # | Melhoria | Justificativa |
|---|---|---|
| 1 | **Diagramas C4** | Adicionar diagramas C4 (Context, Container, Component, Code) para comunicação com stakeholders |
| 2 | **OpenAPI spec** | Exportar `/$api-docs` do CAP e publicar no SAP API Business Hub |
| 3 | **Runbook operacional** | Documentar procedimentos de troubleshooting, rollback e monitoramento para a equipe de operações |
| 4 | **ADRs adicionais** | Documentar decisões sobre: estratégia de cache, design de eventos, política de versionamento de API |

### 10.5 Melhorias de Segurança

| # | Melhoria | Status | Justificativa |
|---|---|---|---|
| 1 | **Instance-based authorization** | ✅ implementado | `@restrict where: '$user = createdBy'` para SalesProcessor — alice só vê seus próprios pedidos |
| 2 | **Auditoria de acesso** | pendente | Integrar SAP Audit Log Service para registrar todos os acessos a dados pessoais (GDPR) |
| 3 | **Rate limiting** | pendente | Adicionar rate limiting por usuário para prevenir abuso das APIs analíticas |

---

## 11. Referências de Integração e Deploy

### 11.1 Cenários de Consumo

#### SAP Fiori / SAPUI5
```
List Report   → GET /api/orders/OpenOrders (com $filter, $orderby, $top)
Object Page   → GET /api/orders/SalesOrders('id')?$expand=items,partners (com draft)
F4 Helps      → GET /api/catalog/Products?$search=laptop
                GET /api/catalog/BusinessPartners?$filter=blocked eq false
```

#### SAP Build Apps / SAP Joule
```
Criação       → POST /api/orders/SalesOrders
Submissão     → POST /api/orders/SalesOrders('id')/submitOrder
Analytics     → GET /api/analytics/OpenOrdersQuery?$apply=groupby(...)
```

#### APIs Externas / CPI
```
Autenticação  → POST <xsuaa-url>/oauth/token (client_credentials)
Criação       → POST /api/orders/SalesOrders (scope: SalesProcessor)
Leitura draft → GET /api/orders/SalesOrders?$filter=IsActiveEntity eq true
```

### 11.2 Tópicos de Evento (SAP Event Mesh)

| Evento | Tópico | Consumidores |
|---|---|---|
| Pedido criado | `com/my/sales/salesorder/created/v1` | CPI, Build Process Automation |
| Pedido submetido | `com/my/sales/salesorder/submitted/v1` | WM/TM integration |
| Entrega confirmada | `com/my/sales/salesorder/delivered/v1` | Billing system |
| Pedido excluído | `com/my/sales/salesorder/deleted/v1` | Audit log, downstream cleanup |
| Item para entrega | `com/my/sales/salesorder/item.added/v1` | Warehouse Management |

### 11.3 Lições Aprendidas (Fixes Documentados)

| Fix | Problema | Solução |
|---|---|---|
| FIX-01 | Import de dois arquivos no mesmo namespace causava shadowing | Usar aliases distintos: `using ... as sales` e `using ... as catalog` |
| FIX-02 | Múltiplas entidades resolvendo para o mesmo target causavam erro | Marcar uma com `@cds.redirection.target: true` |
| FIX-03 | Campos `EventEmitting` apareciam na UI | Usar `excluding { lastEventType, lastEventAt }` na projeção do serviço |
| FIX-04 | `req.params` vazio em bound actions de draft | Usar `req.params[0]` para acessar a chave da entidade |
| FIX-05 | Erro "composite FK cascade" em grandchildren | Adicionar `cuid` próprio em `SalesOrderItems` para FK simples |
| FIX-06 | Regras de transição duplicadas em vários lugares | Centralizar tudo em `StatusMachine` |
| FIX-07 | View plana coexistindo com entidade transacional causava redirect ambiguity | Views planas apenas em `SalesAnalyticsService` |
| FIX-09 | Misturar `authenticated-user` com roles explícitas criava gap de segurança | Nunca misturar; usar apenas roles explícitas |
| FIX-11 | Sintaxe `{ *, campo }` inválida em views CDS | Usar `{ * }` ou listar campos explicitamente |
| FIX-12 | CAP não encontrava o handler `IntegrationService` (retornava 501) | O arquivo `.ts` do handler deve ter **exatamente o mesmo nome e path** que o `.cds`. Criado `srv/services/integration-service.ts` que re-exporta o handler de `srv/handlers/` |
| FIX-13 | `cds.tx()` aninhado dentro de um action handler causava deadlock no SQLite | SQLite em modo single-connection não suporta transações aninhadas. Solução: usar `this.db.run()` diretamente. UPSERT garante idempotência; transação outer do CAP provê atomicidade |
| FIX-14 | `IntegrationService.httpClient = mock` dentro de `beforeAll` de `describe` não era aplicado antes de `init()` | O mock deve ser setado a nível de **módulo** (antes de `cds.test()`), pois o CAP registra seu `beforeAll` globalmente durante o `require` de `cds.test()` |

---

## 12. Guia de Aprendizado Prático

Esta seção documenta como usar as características do próprio projeto como ambiente de aprendizado — explorando o código com debugger, logs de runtime, REPL interativo e os testes automatizados como scripts de descoberta.

> **Pré-requisito:** projeto rodando com `npm run dev` (ou `cds watch`) e VS Code aberto na raiz do repositório.

---

### 12.1 Debug com ts-node e VS Code

O `cds watch` já usa `ts-node` internamente (habilitado por `"typescript": true` no `package.json`). Isso significa que o Node.js carrega os arquivos `.ts` diretamente — **não há etapa de compilação para JS** antes de iniciar o servidor. O resultado é que qualquer breakpoint colocado no arquivo `.ts` funciona imediatamente sem build.

#### Opção A — Attach (recomendada para `cds watch`)

Inicie o servidor com a flag de inspeção e então conecte o VS Code:

```bash
# Terminal: inicia o CAP com o inspector ativado na porta 9229
node --inspect node_modules/.bin/cds watch
```

Crie `.vscode/launch.json` (se ainda não existir):

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Attach to cds watch",
            "type": "node",
            "request": "attach",
            "port": 9229,
            "restart": true,
            "sourceMaps": true,
            "resolveSourceMapLocations": [
                "${workspaceFolder}/**",
                "!**/node_modules/**"
            ],
            "skipFiles": [
                "<node_internals>/**",
                "**/node_modules/@sap/cds/**"
            ]
        }
    ]
}
```

Pressione **F5** (ou `Run → Start Debugging`) com a configuração "Attach to cds watch". O VS Code conecta ao processo já em execução.

#### Opção B — Launch direto

```json
{
    "name": "CDS Watch (Launch + Debug)",
    "type": "node",
    "request": "launch",
    "runtimeExecutable": "npx",
    "runtimeArgs": ["cds", "watch"],
    "env": { "NODE_OPTIONS": "--inspect" },
    "cwd": "${workspaceFolder}",
    "sourceMaps": true,
    "outFiles": ["${workspaceFolder}/**/*.js", "!**/node_modules/**"],
    "resolveSourceMapLocations": [
        "${workspaceFolder}/**",
        "!**/node_modules/**"
    ],
    "skipFiles": ["<node_internals>/**", "**/node_modules/**"]
}
```

#### Onde colocar breakpoints

| Arquivo | O que observar no breakpoint |
|---|---|
| `srv/lib/status-machine.ts` | Entrada/saída das transições de status (`computeOverallStatus`) |
| `srv/handlers/order-header-handler.ts` | `req.data`, `req.user.id`, parâmetros da action |
| `srv/handlers/order-item-handler.ts` | Composition deep insert — `req.data.items` em `before CREATE` |
| `srv/lib/events.ts` | Payload do CloudEvent antes da emissão para o Outbox |

**Dica:** em handlers CAP, `req.data` contém o payload da requisição, `req.user` contém o usuário autenticado e `req.query` contém a query CQL resolvida — todas as variáveis mais úteis estão no objeto `req`.

---

### 12.2 Logs e Instrumentação CAP

O CAP usa a variável de ambiente `DEBUG` do Node.js para ativar canais de diagnóstico. Cada canal expõe uma camada diferente do runtime.

#### Canais `DEBUG` disponíveis

| Canal | O que revela | Exemplo de uso |
|---|---|---|
| `cds:sql` | Queries SQL/CQL geradas e enviadas ao banco | Ver o JOIN gerado para `$expand=items` |
| `cds:odata` | Payload OData recebido e serializado | Ver o JSON do `$batch` ou de um deep insert |
| `cds:auth` | Decisões de autorização (`@restrict`, `@requires`) | Entender por que uma requisição retorna 403 |
| `cds:serve` | Registro de rotas e handlers no startup | Ver quais handlers foram registrados |
| `cds:compile` | Passos de compilação do modelo CDS | Diagnosticar erros de redirect de association |
| `cds:req` | Headers e parâmetros de cada requisição HTTP recebida | Rastrear o fluxo de uma requisição |
| `cds:*` | Todos os canais simultaneamente | Diagnóstico completo (verbose) |

#### Uso em desenvolvimento

```bash
# Apenas queries SQL — menos ruído, mais foco
DEBUG=cds:sql npm run dev

# SQL + decisões de auth — útil para testar @restrict
DEBUG=cds:sql,cds:auth npm run dev

# Tudo — use para diagnosticar erros difíceis
DEBUG=cds:* npm run dev
```

**Exemplo de saída `DEBUG=cds:sql`:**

```
[cds:sql] - SELECT ID, salesOrder, orderDate, netAmount, overallStatus,
            soldTo.partnerName as soldTo_partnerName
            FROM com_my_sales_SalesOrders
            WHERE deletionIndicator = ' '
            ORDER BY orderDate DESC
            LIMIT 100
```

Isso revela exatamente quais colunas e filtros o CAP gerou a partir das anotações `@UI.SelectionFields` e `@UI.LineItem`.

#### Ajuste de nível de log no `.cdsrc.json`

```jsonc
// .cdsrc.json — já existente no projeto
{
  "log": {
    "format": "json",       // produção usa JSON; desenvolvimento pode usar "text"
    "level" : "debug"       // níveis: error | warn | info | debug | trace
  }
}
```

Para não afetar produção, use perfis de ambiente:

```jsonc
{
  "log": {
    "format": "json",
    "[development]": { "format": "text", "level": "debug" },
    "[production]" : { "format": "json", "level": "warn"  }
  }
}
```

Com `"level": "debug"`, o CAP imprime informações de inicialização de serviços, modelos carregados e handshakes de autenticação sem precisar da variável `DEBUG`.

---

### 12.3 REPL e Exploração Interativa

O `cds repl` é um shell Node.js com o runtime CAP pré-carregado. Permite inspecionar o modelo compilado, executar queries CQL e chamar serviços sem reiniciar o servidor.

```bash
# Inicia o REPL conectado ao projeto atual
cds repl
```

#### Explorando o modelo compilado

```javascript
// Conecta o REPL ao projeto (lê package.json e .cdsrc.json)
await cds.connect()

// Inspeciona todas as entidades do modelo compilado
Object.keys(cds.model.definitions)
// → ['com.my.sales.SalesOrders', 'com.my.sales.SalesOrderItems', ...]

// Inspeciona os campos de uma entidade específica
cds.model.definitions['com.my.sales.SalesOrders'].elements
// → { ID: { type: 'cds.UUID', key: true }, salesOrder: { type: 'cds.String' }, ... }

// Verifica quais serviços estão registrados
Object.keys(cds.services)
// → ['SalesOrderService', 'SalesCatalogService', 'SalesAnalyticsService', 'db']
```

#### Executando queries CQL ad-hoc

```javascript
// Conecta ao banco SQLite de desenvolvimento
const db = await cds.connect.to('db')

// SELECT simples
const orders = await db.run(SELECT.from('com.my.sales.SalesOrders').limit(5))
console.log(orders)

// SELECT com expand (CQL path expression)
const withItems = await SELECT.from('com.my.sales.SalesOrders')
    .columns('salesOrder', 'items.itemNumber', 'items.product.name')
    .limit(3)
// → array de orders com items aninhados

// INSERT de teste
await INSERT.into('com.my.sales.SalesOrders').entries({
    salesOrder: 'TEST-001',
    orderDate : '2026-01-01'
})

// Verifica o resultado
await SELECT.one.from('com.my.sales.SalesOrders').where({ salesOrder: 'TEST-001' })
```

#### Inspecionando um serviço

```javascript
// Acessa a instância do serviço
const srv = await cds.connect.to('SalesOrderService')

// Chama uma ação programaticamente (sem HTTP)
const result = await srv.send('submitOrder', {
    ID: '<uuid-de-um-pedido-existente>'
})
```

> **Dica:** o REPL mantém o histórico de comandos entre sessões (arquivo `~/.cds_repl_history`). Use `↑` para recuperar queries anteriores.

---

### 12.4 Fiori Preview e Inspeção do `$metadata`

O `cds watch` gera automaticamente um launchpad de sandbox acessível em:

```
http://localhost:4004/$fiori-preview
```

Este endpoint lista todos os apps Fiori descobertos na pasta `app/` (qualquer subpasta que contenha um `webapp/manifest.json`). Não requer configuração adicional — apenas o `cds watch` em execução.

#### Apps disponíveis neste projeto

| App | URL de Preview | Template |
|---|---|---|
| Sales Orders | `/$fiori-preview/orders/index.html` | List Report + Object Page |
| Sales Analytics | `/$fiori-preview/analytics/index.html` | Analytical List Page |

#### Inspecionando o `$metadata` OData

O documento `$metadata` é a fonte da verdade sobre o que foi compilado. Use-o para verificar se as anotações CDS foram traduzidas corretamente.

```bash
# Verifica Draft: procure por "IsActiveEntity", "HasDraftEntity"
curl http://localhost:4004/api/orders/$metadata | grep -i "draft\|IsActive"

# Verifica @Analytics.query: procure por "ApplySupported"
curl http://localhost:4004/api/analytics/$metadata | grep -i "Apply\|Dimension\|Measure"

# Verifica bound actions: procure por "Action" com IsBound="true"
curl http://localhost:4004/api/orders/$metadata | grep -i "submitOrder\|IsBound"
```

Ou abra diretamente no navegador para uma leitura formatada:

| Endpoint | O que verificar |
|---|---|
| `http://localhost:4004/api/orders/$metadata` | Presença de `IsActiveEntity`, `DraftAdminData`, bound actions `submitOrder`, `confirmDelivery`, `logicalDelete` |
| `http://localhost:4004/api/analytics/$metadata` | Presença de `ApplySupported`, anotações `Dimension` e `Measure` nas entidades `OpenOrdersQuery`, `ItemRevenueQuery` |
| `http://localhost:4004/api/catalog/$metadata` | Entidades de referência: `Products`, `BusinessPartners`, `SalesAreas` |

#### O que procurar no `$metadata` do app orders

```xml
<!-- Draft habilitado: estas propriedades aparecem em SalesOrders -->
<Property Name="IsActiveEntity"  Type="Edm.Boolean" />
<Property Name="HasDraftEntity"  Type="Edm.Boolean" />
<Property Name="HasActiveEntity" Type="Edm.Boolean" />

<!-- Bound action: IsBound="true" e parâmetro de binding -->
<Action Name="submitOrder" IsBound="true">
    <Parameter Name="_it" Type="SalesOrderService.SalesOrders" />
</Action>

<!-- Anotação UI compilada: gerada a partir de app/orders/annotations.cds -->
<Annotation Term="UI.LineItem">
    <Collection>
        <Record Type="UI.DataField">
            <PropertyValue Property="Value" Path="salesOrder" />
        </Record>
        ...
    </Collection>
</Annotation>
```

---

### 12.5 Testes como Documentação Executável

Os testes em `test/sales-order-service.test.ts` e `test/integration-service.test.ts` usam `cds.test()` — que inicializa o servidor completo com SQLite em memória. Isso os torna **scripts de exploração** além de testes de regressão.

#### Estrutura básica do `cds.test()`

```typescript
// Padrão já usado no projeto (test/sales-order-service.test.ts)
import cds from '@sap/cds'

const { GET, POST, PATCH, DELETE } = cds.test(__dirname + '/..')

// Usuários mockados (definidos em package.json > cds.requires.auth)
const AS_BOB     = { auth: { username: 'bob',     password: '' } } // SalesManager
const AS_ALICE   = { auth: { username: 'alice',   password: '' } } // SalesProcessor
const AS_CHARLIE = { auth: { username: 'charlie', password: '' } } // SalesAuditor
```

#### Inspecionando payloads sem Postman

Adicione `console.log` temporário em qualquer teste para ver o payload completo:

```typescript
it('inspeciona o payload de SalesOrders', async () => {
    const response = await GET('/api/orders/SalesOrders', AS_ALICE)

    // Imprime o JSON completo — útil para entender a estrutura de draft
    console.log(JSON.stringify(response.data, null, 2))

    // Imprime apenas as chaves de draft
    console.log('Draft keys:', Object.keys(response.data.value?.[0] ?? {}))
})
```

#### Explorando autorização por usuário

```typescript
it('demonstra instance-based authorization', async () => {
    // alice (SalesProcessor) cria um pedido
    const { data: created } = await POST('/api/orders/SalesOrders', {
        salesOrder: 'EXPLORE-001',
        orderDate : '2026-01-01'
    }, AS_ALICE)
    console.log('Criado por alice, ID:', created.ID)

    // alice consegue ler o próprio pedido (@restrict where: '$user = createdBy')
    const { data: aliceRead } = await GET(`/api/orders/SalesOrders(${created.ID})`, AS_ALICE)
    console.log('Alice lê o próprio pedido:', aliceRead.salesOrder)

    // charlie (SalesAuditor) consegue ler o pedido de alice (cross-user read)
    const { data: charlieRead } = await GET(`/api/orders/SalesOrders(${created.ID})`, AS_CHARLIE)
    console.log('Charlie lê pedido de alice:', charlieRead.salesOrder)
})
```

#### Executando um subconjunto de testes

```bash
# Roda apenas testes de um describe específico
npm test -- --testNamePattern "StatusMachine"

# Roda apenas o arquivo de testes do serviço de pedidos
npm test -- sales-order-service

# Modo watch com filtro
npm run test:watch -- --testNamePattern "submitOrder"

# Com saída verbose (mostra console.log e nomes de cada teste)
npm test -- --verbose
```

#### Adicionando um teste de exploração próprio

Crie `test/exploration.test.ts` para experimentar sem risco de quebrar os testes existentes:

```typescript
import cds from '@sap/cds'

const { GET, POST } = cds.test(__dirname + '/..')
const AS_BOB = { auth: { username: 'bob', password: '' } }

describe('Exploração livre', () => {

    it('inspeciona $metadata do SalesAnalyticsService', async () => {
        const { data } = await GET('/api/analytics/$metadata')
        // O $metadata é XML — procure por "ApplySupported"
        console.log(data.slice(0, 2000))
    })

    it('testa $apply aggregation no analytics', async () => {
        const { data } = await GET(
            '/api/analytics/OpenOrdersQuery' +
            '?$apply=groupby((soldToName),aggregate(netAmount with sum as total))',
            AS_BOB
        )
        console.log('Agregação por cliente:', JSON.stringify(data.value, null, 2))
    })

})
```

---

### 12.6 Roteiro de Aprendizado Sugerido

A ordem abaixo respeita as dependências conceituais do projeto — cada etapa usa as ferramentas das seções anteriores para observar o que foi introduzido.

#### Etapa 1 — Modelo de Domínio CDS

**Arquivos:** `db/types/common-types.cds` → `db/aspects/domain-aspects.cds` → `db/masterdata/master-data.cds` → `db/domain/sales-orders.cds`

**O que observar:**
```bash
# Compila o modelo e mostra o JSON resultante (entidades, campos, associações)
DEBUG=cds:compile cds compile db/ --to json | head -100

# Alternativa no REPL — após cds repl + await cds.connect()
cds.model.definitions['com.my.sales.SalesOrders'].elements
```

**Pergunta guia:** quais campos de `SalesOrders` vêm do `cuid`, quais do `managed`, quais do `StatusTracked`?

---

#### Etapa 2 — Serviços OData e Projeções

**Arquivos:** `srv/services/sales-order-service.cds`

**O que observar:**
```bash
# Veja o $metadata de cada serviço — verifique quais entidades foram expostas
open http://localhost:4004/api/orders/$metadata
open http://localhost:4004/api/catalog/$metadata
open http://localhost:4004/api/analytics/$metadata
```

**Pergunta guia:** por que `SalesOrderItemsFlat` não aparece em `/api/orders/$metadata`? (veja ADR-09 em `docs/ARCHITECTURE.md`)

---

#### Etapa 3 — Handlers TypeScript e Regras de Negócio

**Arquivos:** `srv/lib/status-machine.ts` → `srv/handlers/order-header-handler.ts` → `srv/handlers/order-item-handler.ts`

**O que observar:**
```bash
# Coloque breakpoint em order-header-handler.ts, linha do before('CREATE')
# Depois faça um POST:
curl -u alice:alice -X POST http://localhost:4004/api/orders/SalesOrders \
  -H "Content-Type: application/json" \
  -d '{"salesOrder":"DEBUG-001","orderDate":"2026-01-01"}'
```

```bash
# Veja o SQL gerado pelo handler de recalculatePricing
DEBUG=cds:sql npm run dev
# Depois chame a action e observe o terminal
```

**Pergunta guia:** em qual momento o `netAmount` do header é recalculado? Trace o fluxo desde o `after UPDATE` até o `cds.update()`.

---

#### Etapa 4 — Testes como Especificação

**Arquivos:** `test/sales-order-service.test.ts`, `test/integration-service.test.ts`

**O que observar:**
```bash
# Rode todos os testes com verbose para ver o que cada um verifica
npm test -- --verbose 2>&1 | head -80

# Rode apenas os testes de submitOrder com console.log ativo
npm test -- --testNamePattern "submitOrder" --verbose
```

**Exercício:** adicione `console.log(req.data)` dentro de um handler e chame o teste correspondente. O log aparece no terminal do Jest.

---

#### Etapa 5 — Anotações Fiori e Rendering

**Arquivos:** `app/orders/annotations.cds`, `app/analytics/annotations.cds`

**O que observar:**
```
# Abra o Fiori Preview e navegue pelas telas
http://localhost:4004/$fiori-preview
```

**Exercício:** remova temporariamente um campo do `@UI.LineItem` em `app/orders/annotations.cds`, salve (o `cds watch` recompila) e recarregue o List Report — a coluna desaparece instantaneamente. Reverta a mudança.

**Pergunta guia:** onde no `$metadata` você encontra a anotação `UI.LineItem` compilada? Compare com o que está escrito em `annotations.cds`.

---

#### Etapa 6 — Analytics e `$apply`

**Arquivos:** `app/analytics/annotations.cds`, `srv/services/sales-order-service.cds` (seção SalesAnalyticsService)

**O que observar:**
```bash
# $apply com groupby — observe o SQL gerado com DEBUG=cds:sql
DEBUG=cds:sql curl -u bob:bob \
  "http://localhost:4004/api/analytics/OpenOrdersQuery?\$apply=groupby((salesOrgCode),aggregate(netAmount with sum as totalRevenue))"

# Sem $apply — retorna linhas individuais (máx 1000 por @odata.maxpagesize)
curl -u bob:bob "http://localhost:4004/api/analytics/OpenOrdersQuery"
```

**Pergunta guia:** o que acontece se você remover `@Analytics.Measure: true` de `netAmount` na definição do serviço? O `$apply` com `aggregate` quebra ou continua funcionando?

---

#### Resumo do roteiro

| Etapa | Arquivo central | Ferramenta de observação | Conceito CAP |
|---|---|---|---|
| 1 — Modelo | `db/domain/sales-orders.cds` | `cds compile --to json` / REPL | Aspects, Composition, Association |
| 2 — Serviços | `srv/services/sales-order-service.cds` | `$metadata` OData | Projeção, @restrict, Draft |
| 3 — Handlers | `srv/handlers/order-header-handler.ts` | Breakpoint + `DEBUG=cds:sql` | before/on/after, req.data |
| 4 — Testes | `test/sales-order-service.test.ts` | `npm test --verbose` | cds.test(), mocked auth |
| 5 — Fiori | `app/orders/annotations.cds` | `/$fiori-preview` | @UI.LineItem, @UI.Facets |
| 6 — Analytics | `app/analytics/annotations.cds` | `DEBUG=cds:sql` + `$apply` | @Analytics.query, $apply |

---

## 13. Features Avançadas Implementadas

Esta seção documenta as oito features CAP adicionadas à Onda de aprendizado avançado. Cada subseção descreve o que foi implementado, os arquivos envolvidos e o que observar no runtime.

---

### 13.1 `@cap-js/change-tracking` — Histórico de Alterações

**Propósito:** registrar campo a campo cada alteração feita em `SalesOrders` sem nenhum handler manual.

**Arquivos modificados:**
- [db/domain/sales-orders.cds](../db/domain/sales-orders.cds) — anotação `@ChangeTracking` na entidade raiz
- [package.json](../package.json) — dependência `@cap-js/change-tracking: ^1`

**Como ativar:**
```bash
npm install   # instala @cap-js/change-tracking
cds watch     # o plugin registra automaticamente after-WRITE hooks
```

**O que observar no runtime:**

| Ponto de observação | O que aparece |
|---|---|
| `$metadata` de `SalesOrders` | Nova entidade `Changes` com navegação `changes` |
| Fiori Preview — Object Page | Aba "Change History" gerada automaticamente |
| `DEBUG=cds:*` no startup | `[change-tracking] Registered after-handlers for SalesOrders` |
| `GET /api/orders/SalesOrders('<id>')/changes` | JSON com array de `{ attribute, old, new, at, by }` |

**Exemplo de resposta:**
```json
{
  "value": [
    {
      "entityKey": "{ \"ID\": \"abc-123\" }",
      "attribute": "overallStatus",
      "valueChangedFrom": "A",
      "valueChangedTo": "B",
      "modifiedAt": "2026-04-11T10:00:00Z",
      "modifiedBy": "alice"
    }
  ]
}
```

**Lição-chave:** o plugin substitui o que você escreveria manualmente num `after UPDATE` para gravar auditoria. Contraste: `managed` registra *quando* e *quem* — `@ChangeTracking` registra *o quê* mudou.

---

### 13.2 `@cap-js/audit-logging` — Conformidade GDPR/SOX

**Propósito:** gravar no SAP Audit Log Service toda leitura ou escrita de dados pessoais — obrigatório para GDPR (art. 30) e SOX.

**Arquivos modificados:**
- [db/masterdata/master-data.cds](../db/masterdata/master-data.cds) — anotações `@PersonalData` em `BusinessPartners` e `BusinessPartnerAddresses`
- [db/domain/sales-orders.cds](../db/domain/sales-orders.cds) — anotação `@PersonalData.EntitySemantics: 'DataSubjectDetails'` em `SalesOrderPartners`
- [package.json](../package.json) — dependência `@cap-js/audit-logging: ^1`

**Vocabulário `@PersonalData` utilizado:**

| Anotação | Campo | Significado |
|---|---|---|
| `@PersonalData.EntitySemantics: 'DataSubject'` | `BusinessPartners` | Esta entidade *é* o titular dos dados |
| `@PersonalData.EntitySemantics: 'DataSubjectDetails'` | `BusinessPartnerAddresses`, `SalesOrderPartners` | Entidade relacionada ao titular |
| `@PersonalData.FieldSemantics: 'DataSubjectID'` | `code`, `partner` | Chave que identifica o titular no log |
| `@PersonalData.IsPotentiallyPersonal` | `name`, `name2`, `street`, `city`, `partnerName` | Campo pessoal — gera entrada no log a cada leitura |
| `@PersonalData.IsPotentiallySensitive` | `taxNumber1` | Dado sensível — log adicional de acesso |

**O que observar no runtime:**
```bash
DEBUG=cds:audit npm run dev

# Cada GET /api/catalog/BusinessPartners gera:
# [audit] READ PersonalData: { entity: 'BusinessPartners', id: { code: 'ACME' }, ... }
```

**Lição-chave:** `@restrict` protege o *acesso* (quem pode chamar o endpoint). `@PersonalData` protege os *dados* (registra que dados pessoais foram acessados). São camadas ortogonais — um usuário autorizado ainda gera entradas de auditoria.

---

### 13.3 `SELECT.forUpdate()` — Lock Pessimista

**Propósito:** prevenir race conditions em transições de estado irreversíveis.

**Arquivos modificados:**
- [srv/handlers/order-header-handler.ts](../srv/handlers/order-header-handler.ts) — `.forUpdate({ wait: 5 })` em `onSubmitOrder`, `onConfirmDelivery` e `onLogicalDelete`

**Padrão implementado:**
```typescript
// Adquire lock ANTES de validar o estado atual
const order = await SELECT.one
    .from(SalesOrders)
    .columns('ID', 'salesOrder', 'overallStatus', ...)
    .where({ ID: key.ID })
    .forUpdate({ wait: 5 })   // WAIT 5 → aguarda até 5s, depois 409
```

**O que observar com `DEBUG=cds:sql`:**
```sql
-- HANA Cloud:
SELECT ID, salesOrder, overallStatus ... FROM SalesOrders
WHERE ID = ? FOR UPDATE WAIT 5

-- SQLite (dev): aceita a chamada sem emitir FOR UPDATE
-- O comportamento de lock real é testável apenas em HANA
```

**Lição-chave:** Draft do CAP resolve conflito de *formulário* (dois usuários editando o mesmo rascunho). `forUpdate` resolve conflito de *ação de negócio* (duas chamadas simultâneas de `submitOrder` para o mesmo pedido). São mecanismos complementares.

---

### 13.4 Localização Completa — `localized` + seed multilíngue

**Propósito:** demonstrar o ciclo completo de resolução de idioma via `Accept-Language`.

**Arquivos criados:**

| Arquivo | Conteúdo |
|---|---|
| [db/data/com.my.sales-SalesOrderTypes.csv](../db/data/com.my.sales-SalesOrderTypes.csv) | Dados base em inglês |
| [db/data/com.my.sales-SalesOrderTypes_texts.csv](../db/data/com.my.sales-SalesOrderTypes_texts.csv) | Traduções: pt, de, es |
| [db/data/com.my.sales-DistributionChannels.csv](../db/data/com.my.sales-DistributionChannels.csv) | Dados base em inglês |
| [db/data/com.my.sales-DistributionChannels_texts.csv](../db/data/com.my.sales-DistributionChannels_texts.csv) | Traduções: pt, de, es |
| [db/data/com.my.sales-Divisions.csv](../db/data/com.my.sales-Divisions.csv) | Dados base em inglês |
| [db/data/com.my.sales-Divisions_texts.csv](../db/data/com.my.sales-Divisions_texts.csv) | Traduções: pt, de, es |

**Testes adicionados** em [test/sales-order-service.test.ts](../test/sales-order-service.test.ts):
```typescript
// Verifica resolução de locale e fallback automático
describe('Localization — Accept-Language resolution', () => { ... })
```

**O que observar com `DEBUG=cds:sql`:**
```sql
-- CAP gera JOIN automático com a tabela _texts:
SELECT t1.code, COALESCE(t2.name, t1.name) as name
FROM SalesOrderTypes t1
LEFT JOIN SalesOrderTypes_texts t2
  ON t1.code = t2.code AND t2.locale IN ('pt', 'en')
ORDER BY t2.locale DESC
```

**Teste dos locales:**
```bash
curl -H "Accept-Language: pt" http://localhost:4004/api/catalog/SalesOrderTypes
# → OR: "Pedido Padrão"

curl -H "Accept-Language: ja" http://localhost:4004/api/catalog/SalesOrderTypes
# → OR: "Standard Order"  (fallback para en)
```

---

### 13.5 Remote Service Declarativo — `cds.connect.to()`

**Propósito:** demonstrar que o mesmo CQL usado para entidades locais funciona para serviços externos.

**Arquivos criados/modificados:**

| Arquivo | Papel |
|---|---|
| [srv/external/northwind.cds](../srv/external/northwind.cds) | Definição declarativa `@cds.external: true` do serviço Northwind |
| [srv/integration/northwind-remote-client.ts](../srv/integration/northwind-remote-client.ts) | Cliente que usa `cds.connect.to('Northwind')` + CQL |
| [.cdsrc.json](../.cdsrc.json) | Binding `requires.Northwind` com URL da API |

**Contraste imperativo vs. declarativo:**

```typescript
// ANTES — imperativo (northwind-client.ts):
const url = `${BASE}/Orders?$top=${n}&$expand=Order_Details(...)`
const res = await this.http.get<ODataCollectionResponse<NwOrder>>(url)
return res.value   // desembrulhar manualmente

// AGORA — declarativo (northwind-remote-client.ts):
const nw = await cds.connect.to('Northwind')
return await nw.run(
    SELECT.from('Northwind.Orders')
          .columns('OrderID', 'CustomerID', 'to_Details.ProductID', ...)
          .limit(maxOrders)
)
// CAP gera URL, adiciona $expand, desembrulha value[], trata erros
```

**O que observar com `DEBUG=cds:remote`:**
```
[cds:remote] → GET https://services.odata.org/.../Orders
               ?$top=5&$expand=to_Details($select=ProductID,UnitPrice,...)
[cds:remote] ← 200 OK (5 records in 243ms)
```

**Lição-chave:** `cds.connect.to('db')` (local) e `cds.connect.to('Northwind')` (remoto OData) são usados com CQL idêntico. O CAP abstrai o transporte — trocar de local para remoto não muda o código do handler, apenas a configuração em `.cdsrc.json`.

---

### 13.6 Custom REST Endpoints (non-OData)

**Propósito:** demonstrar que o CAP não é exclusivamente OData — permite rotas HTTP puras dentro de um `ApplicationService`.

**Arquivos modificados:**
- [srv/handlers/order-header-handler.ts](../srv/handlers/order-header-handler.ts) — métodos `customHealthCheck` e `onDeliveryWebhook`

**Endpoints implementados:**

| Método | Path | Quem chama | Descrição |
|---|---|---|---|
| `GET` | `/api/orders/health` | Monitoramento, k8s liveness probe | Retorna contadores de pedidos por status |
| `POST` | `/api/orders/delivery-webhook` | Sistema WMS externo | Recebe confirmação de entrega via webhook |

**Registro no handler:**
```typescript
this.svc.on('GET',  '/health',           this.customHealthCheck.bind(this))
this.svc.on('POST', '/delivery-webhook', this.onDeliveryWebhook.bind(this))
```

**Teste dos endpoints:**
```bash
# Health check — JSON puro, sem envelope @odata.context
curl -u alice:alice http://localhost:4004/api/orders/health
# → { "status": "ok", "timestamp": "...", "orders": { "open": 3, "inProcess": 1, "completed": 0 } }

# Webhook — simula notificação do WMS
curl -u bob:bob -X POST http://localhost:4004/api/orders/delivery-webhook \
  -H "Content-Type: application/json" \
  -d '{"salesOrder":"0000000001","confirmedAt":"2026-04-11T10:00:00Z"}'
# → { "accepted": true, "idempotent": false, "salesOrder": "0000000001", ... }
```

**Lição-chave:** custom routes são invisíveis para o `$metadata` OData — não aparecem para clientes Fiori. Use-as para: health checks, webhooks inbound, APIs de integração simples. Para tudo que precisa de Draft, F4, `$filter`, `$expand` — use entidades OData.

---

### 13.7 `@cap-js/attachments` — Anexos via OData Stream

**Propósito:** adicionar upload/download de arquivos (PDFs, contratos, PoDs) ao agregado `SalesOrders`.

**Arquivo criado:**
- [db/domain/sales-orders-attachments.cds](../db/domain/sales-orders-attachments.cds) — extensão isolada com `extend entity SalesOrders`

> **Pré-requisito:** `npm install` (o pacote está declarado no `package.json`).
> Enquanto não instalado, este arquivo é o único que emite erro de compilação — o restante do projeto compila normalmente.

**Padrão de extensão:**
```cds
// Arquivo isolado — só compila após npm install
using { com.my.sales.SalesOrders } from './sales-orders';
using { Attachments }               from '@cap-js/attachments';

extend entity SalesOrders with {
    attachments : Composition of many Attachments;
}
```

**Após instalação e `cds watch`:**
```bash
# Upload de PDF
curl -u bob:bob -X POST \
  "http://localhost:4004/api/orders/SalesOrders('<ID>')/attachments" \
  -H "Content-Type: application/pdf" \
  -H "slug: invoice.pdf" \
  --data-binary @invoice.pdf

# Download
curl -u alice:alice \
  "http://localhost:4004/api/orders/SalesOrders('<ID>')/attachments('<FILE-ID>')/content" \
  -o downloaded-invoice.pdf
```

**Storage por ambiente:**

| Ambiente | Onde os arquivos ficam |
|---|---|
| Desenvolvimento | `.attachments/<entity>/<ID>/<filename>` na raiz do projeto |
| BTP Produção | SAP Object Store Service (binding automático via `mta.yaml`) |

---

### 13.8 Messaging Bidirecional — Ciclo Completo de Eventos

**Propósito:** fechar o ciclo de integração orientada a eventos — o projeto agora tanto *publica* quanto *consome* eventos do SAP Event Mesh.

**Arquivos criados/modificados:**

| Arquivo | Papel |
|---|---|
| [srv/handlers/event-consumer-handler.ts](../srv/handlers/event-consumer-handler.ts) | Novo — consome eventos inbound de WMS e TMS |
| [srv/handlers/sales-order-service.ts](../srv/handlers/sales-order-service.ts) | Modificado — registra `EventConsumerHandler.register()` no `init()` |
| [package.json](../package.json) | Adicionados `publishPrefix` e `subscribePrefix` ao binding de messaging |

**Tópicos consumidos:**

| Tópico | Publicador | Ação local |
|---|---|---|
| `wms/delivery/confirmed/v1` | WMS após baixa de estoque | `deliveryStatus → 'C'` + texto `ZWMS` |
| `tms/shipment/dispatched/v1` | TMS após despacho | Texto `ZTMS` com tracking code |

**Ciclo completo de eventos implementado:**
```
SalesOrders.submitOrder()
    │  publica via CAP Outbox
    ▼
Event Mesh: com/my/sales/salesorder/submitted/v1
    │  WMS processa e confirma
    ▼
Event Mesh: wms/delivery/confirmed/v1
    │  EventConsumerHandler.register()
    ▼
SalesOrders.deliveryStatus → 'C'
    │  publica via CAP Outbox
    ▼
Event Mesh: com/my/sales/salesorder/delivered/v1
    │  Billing inicia faturamento
    ▼
    ...
```

**Simular mensagem inbound em desenvolvimento:**
```bash
# file-based-messaging — escreve arquivo que o consumer lê
npx cds-ts emit wms/delivery/confirmed/v1 \
  '{"salesOrder":"0000000001","confirmedAt":"2026-04-11T10:00:00Z","reference":"WM-9981"}'

# Observe com DEBUG=cds:messaging:
# [cds:messaging] ← wms/delivery/confirmed/v1 { salesOrder: '0000000001', ... }
# [OrderHeaderHandler] Order '0000000001': deliveryStatus → C
```

**Idempotência — garantia implementada:**
```typescript
// Se deliveryStatus já é 'C', a mensagem duplicada é descartada:
if (order.deliveryStatus === 'C') {
    LOG.info('idempotent discard — already FullyDelivered')
    return   // sem erro, sem reprocessamento
}
```

**Lição-chave:** o Event Mesh garante entrega *at-least-once* — a mesma mensagem pode chegar duas vezes após um restart. O handler DEVE ser idempotente. O `SELECT.forUpdate()` (implementado na §13.3) previne race condition quando duas cópias da mesma mensagem chegam simultaneamente.

---

### 13.9 Resumo dos Artefatos Criados/Modificados

| Artefato | Tipo | Feature |
|---|---|---|
| [db/domain/sales-orders.cds](../db/domain/sales-orders.cds) | modificado | `@ChangeTracking`, `@PersonalData` em `SalesOrderPartners` |
| [db/masterdata/master-data.cds](../db/masterdata/master-data.cds) | modificado | `@PersonalData` em `BusinessPartners` e `BusinessPartnerAddresses` |
| [db/domain/sales-orders-attachments.cds](../db/domain/sales-orders-attachments.cds) | novo | `@cap-js/attachments` — extensão isolada |
| [db/data/com.my.sales-SalesOrderTypes.csv](../db/data/com.my.sales-SalesOrderTypes.csv) | novo | Seed data base (en) |
| [db/data/com.my.sales-SalesOrderTypes_texts.csv](../db/data/com.my.sales-SalesOrderTypes_texts.csv) | novo | Traduções pt/de/es |
| [db/data/com.my.sales-DistributionChannels.csv](../db/data/com.my.sales-DistributionChannels.csv) | novo | Seed data base (en) |
| [db/data/com.my.sales-DistributionChannels_texts.csv](../db/data/com.my.sales-DistributionChannels_texts.csv) | novo | Traduções pt/de/es |
| [db/data/com.my.sales-Divisions.csv](../db/data/com.my.sales-Divisions.csv) | novo | Seed data base (en) |
| [db/data/com.my.sales-Divisions_texts.csv](../db/data/com.my.sales-Divisions_texts.csv) | novo | Traduções pt/de/es |
| [srv/external/northwind.cds](../srv/external/northwind.cds) | novo | Remote Service declarativo `@cds.external` |
| [srv/integration/northwind-remote-client.ts](../srv/integration/northwind-remote-client.ts) | novo | Cliente CQL via `cds.connect.to('Northwind')` |
| [srv/handlers/order-header-handler.ts](../srv/handlers/order-header-handler.ts) | modificado | `forUpdate()`, `/health`, `/delivery-webhook` |
| [srv/handlers/event-consumer-handler.ts](../srv/handlers/event-consumer-handler.ts) | novo | Consumer `wms/delivery/confirmed/v1`, `tms/shipment/dispatched/v1` |
| [srv/handlers/sales-order-service.ts](../srv/handlers/sales-order-service.ts) | modificado | Registra `EventConsumerHandler` no `init()` |
| [test/sales-order-service.test.ts](../test/sales-order-service.test.ts) | modificado | Suite de testes de localização com `Accept-Language` |
| [package.json](../package.json) | modificado | 3 plugins CAP, `publishPrefix`/`subscribePrefix` de messaging |
| [.cdsrc.json](../.cdsrc.json) | modificado | Binding `requires.Northwind` |

---

---

## 14. Fiori Elements Avançado

Esta seção documenta as quatro features avançadas de Fiori Elements implementadas em `app/orders/`, expandindo a camada de UI além das anotações base da §13.

### 14.0 Bootstrap do `index.html` — Estrutura Obrigatória

Cada app Fiori requer dois artefatos no ponto de entrada:

**1. Script de bootstrap (dentro de `<head>`):**
```html
<script
  id="sap-ui-bootstrap"
  src="https://ui5.sap.com/1.120/resources/sap-ui-core.js"
  data-sap-ui-theme="sap_horizon"
  data-sap-ui-resourceroots='{"com.my.sales.orders": "./"}'
  data-sap-ui-compatVersion="edge"
  data-sap-ui-async="true"
  data-sap-ui-onInit="module:sap/ui/core/ComponentSupport"
  data-sap-ui-frameOptions="trusted"
></script>
```

**2. Div marcadora com `data-sap-ui-component` (dentro de `<body>`):**
```html
<body class="sapUiBody" id="content">
  <div
    data-sap-ui-component
    data-name="com.my.sales.orders"
    data-id="container"
    data-settings='{"id": "container"}'
    style="height: 100%"
  ></div>
</body>
```

**Por que a `<div>` é obrigatória:** o módulo `sap/ui/core/ComponentSupport` (declarado em `data-sap-ui-onInit`) varre o DOM ao inicializar. Quando encontra um elemento com `data-sap-ui-component`, instancia o componente cujo namespace está em `data-name`. **Se o `<body>` estiver vazio, nada é renderizado — a tela permanece em branco sem erro explícito no console.**

| Atributo | Valor para orders | Valor para analytics |
|---|---|---|
| `data-name` | `com.my.sales.orders` | `com.my.sales.analytics` |
| `data-id` | `container` | `container` |

> **Armadilha comum:** body vazio com `<body class="sapUiBody" id="content"></body>` faz o bootstrap rodar mas não renderiza nada. O `ComponentSupport` não gera erro — simplesmente não encontra nenhum componente para montar.

---

### 14.1 Side Effects (`@Common.SideEffects`)

**Problema:** sem Side Effects, o Fiori Elements só re-lê o objeto completo ao salvar o Draft. Quando o usuário clica em "Submit Order", o `overallStatus` muda no backend — mas a tela ainda exibe "Open" até o próximo reload.

**Solução:** `@Common.SideEffects` instrui o FE a fazer um request cirúrgico após cada ação, buscando apenas os campos listados — UX imediata, sem reload de página.

**Dois tipos de trigger:**

| Tipo | Disparado por | Exemplo |
|---|---|---|
| `SourceActions` | Bound action executada | Botão "Submit Order" |
| `SourceProperties` | Campo editado pelo usuário | Alterar `orderQuantity` |

**Implementação em `app/orders/annotations.cds` §7:**

```cds
// Após submitOrder → refrescar os três indicadores de status
Common.SideEffects #AfterSubmitOrder: {
    SourceActions   : ['SalesOrderService.submitOrder'],
    TargetProperties: ['overallStatus', 'deliveryStatus', 'billingStatus']
},

// Após recalculatePricing → refrescar netAmount no header E em todos os itens
Common.SideEffects #AfterRecalcPricing: {
    SourceActions   : ['SalesOrderService.recalculatePricing'],
    TargetProperties: ['netAmount'],
    TargetEntities  : [{ $NavigationPropertyPath: 'items' }]  // re-expande a composition
},

// Quando o usuário edita a quantidade → refrescar netAmount do item
Common.SideEffects #OnQuantityChange: {    // em SalesOrderItems
    SourceProperties: ['orderQuantity'],
    TargetProperties: ['netAmount']
}
```

**`TargetEntities` com `$NavigationPropertyPath`:**
- `'items'` → re-expande a composição inteira (sub-tabela de itens)
- `''` (vazio) → re-busca a entidade corrente (o próprio item após `addToDelivery`)

**Regra de aprendizado:** sempre que uma bound action mudar mais de uma entidade ou campos que o FE não "sabe" que foram alterados, adicione um Side Effect. Sem ele, o dado no backend está correto mas a tela mostra um estado defasado.

---

### 14.2 Connected Fields (`@UI.ConnectedFields`)

**Problema:** campos semanticamente relacionados como `orderDate` + `requestedDelivDate` ocupam duas linhas separadas no formulário, aumentando o scroll sem agregar clareza.

**Solução:** `@UI.ConnectedFields` agrupa dois ou mais campos em um único slot visual com um Template de concatenação.

**Dois casos implementados em `app/orders/annotations.cds` §8:**

```cds
// 1. Order Period: "01.01.2025 → 15.01.2025"
UI.ConnectedFields #OrderPeriod: {
    Label   : 'Order Period',
    Template: '{OrderDate} → {DelivDate}',
    Data    : {
        OrderDate: { $Type: 'UI.DataField', Value: orderDate          },
        DelivDate: { $Type: 'UI.DataField', Value: requestedDelivDate }
    }
}

// 2. Quantity + Unit: "100 PC"
UI.ConnectedFields #QuantityWithUnit: {
    Label   : 'Order Quantity',
    Template: '{Qty} {Unit}',
    Data    : {
        Qty : { $Type: 'UI.DataField', Value: orderQuantity     },
        Unit: { $Type: 'UI.DataField', Value: orderQuantityUnit }
    }
}
```

**Para referenciar em FieldGroup ou LineItem:**
```cds
{ $Type : 'UI.DataFieldForAnnotation',
  Target: '@UI.ConnectedFields#OrderPeriod',
  Label : 'Order Period' }
```

**Integração com FieldGroups existentes:**
Os FieldGroups `#HeaderDates` (§4) e `#ItemDetails` (§5) foram atualizados para referenciar os ConnectedFields. Não foram necessários overrides em blocos separados — a referência foi inserida diretamente nas definições originais, evitando o warning `anno-duplicate-same-file`.

**Regra de aprendizado:** `@UI.ConnectedFields` é puramente visual — não altera o OData contract nem o modelo de dados. O Template suporta qualquer separador: `→`, `/`, ` - `, `(` `)`, etc.

---

### 14.3 Flexible Column Layout (FCL)

**O que é:** o `sap.f.FlexibleColumnLayout` exibe simultaneamente List Report + Object Page + sub-Object Page em 2 ou 3 colunas responsivas, sem navegação de página completa.

**Antes (navegação de página inteira):**
```
[Lista de pedidos]  →  clique  →  [Detalhes do pedido]  →  clique  →  [Detalhes do item]
         (página 1)                        (página 2)                       (página 3)
```

**Depois (FCL — três colunas simultâneas):**
```
[Lista de pedidos] | [Detalhes do pedido] | [Detalhes do item]
     coluna 1             coluna 2               coluna 3
```

**Configuração em `app/orders/webapp/manifest.json`:**

```json
// 1. Adicionar sap.f às libs
"libs": {
    "sap.m": {}, "sap.ui.core": {},
    "sap.f": {},                     // ← habilita FlexibleColumnLayout
    "sap.fe.templates": {}
},

// 2. Ativar o roteador FCL
"routing": {
    "config": {
        "routerClass": "sap.f.routing.Router"   // ← substitui o router padrão
    },
```

**Rotas com múltiplos targets:**
```json
// 1 coluna: apenas a lista
{ "pattern": ":?query:", "target": "SalesOrdersList" },

// 2 colunas: lista + Object Page do pedido
{ "pattern": "SalesOrders({key}):?query:",
  "target": ["SalesOrdersList", "SalesOrdersObjectPage"] },

// 3 colunas: lista + pedido + item
{ "pattern": "SalesOrders({key})/items({key2}):?query:",
  "target": ["SalesOrdersList", "SalesOrdersObjectPage", "SalesOrderItemsObjectPage"] },

// ScheduleLines: fullscreen (acima do limite de 3 colunas do FCL)
{ "pattern": "SalesOrders({key})/items({key2})/scheduleLines({key3}):?query:",
  "target": "ScheduleLinesObjectPage" }
```

**Como o layout é calculado:** o `sap.f.routing.Router` conta os targets ativos e aplica automaticamente:
- 1 target → `OneColumn`
- 2 targets → `TwoColumnsBeginExpanded`
- 3 targets → `ThreeColumnsMidExpanded`

Sem nenhuma configuração de layout explícita nos targets — o framework cuida de tudo.

**Regra de aprendizado:** a mudança de navegação full-page para FCL é 100% de configuração (manifest.json) — zero mudança de annotations CDS ou handlers TypeScript. É a separação de responsabilidades do FE em ação.

---

### 14.4 Custom Columns via Extension Points

**O que são:** fragmentos XML que o FE injeta como colunas adicionais em tabelas, renderizados com o binding context da linha. Permitem lógica de apresentação impossível com anotações padrão.

**Dois fragmentos implementados:**

**`app/orders/webapp/ext/StatusBadge.fragment.xml`** — List Report
```xml
<!-- Custom column: sap.m.ObjectStatus colorido por overallStatus -->
<m:ObjectStatus
    text="{= ${overallStatus} === 'A' ? 'Open'
           : ${overallStatus} === 'B' ? 'In Process' : 'Completed' }"
    state="{= ${overallStatus} === 'A' ? 'None'
            : ${overallStatus} === 'B' ? 'Warning' : 'Success' }"
    icon="{= ${overallStatus} === 'A' ? 'sap-icon://circle-task'
           : ${overallStatus} === 'B' ? 'sap-icon://pending' : 'sap-icon://accept' }"
    inverted="true"
/>
```

**`app/orders/webapp/ext/ItemPricingStatus.fragment.xml`** — sub-tabela Items
```xml
<!-- Custom column: indica se o item tem precificação calculada -->
<m:ObjectStatus
    text="{= ${netAmount} > 0 ? 'Priced' : 'No Price' }"
    state="{= ${netAmount} > 0 ? 'Success' : 'Warning' }"
    icon="{= ${netAmount} > 0 ? 'sap-icon://accept' : 'sap-icon://warning' }"
/>
```

**Registro em `manifest.json` via `controlConfiguration`:**
```json
// List Report — após a coluna overallStatus
"@com.sap.vocabularies.UI.v1.LineItem": {
    "columns": {
        "CustomStatusBadge": {
            "header"  : "{i18n>colStatusBadge}",
            "template": "com.my.sales.orders.ext.StatusBadge",
            "position": { "placement": "After", "anchor": "DataField::overallStatus" }
        }
    }
},

// Object Page — sub-tabela items, após a coluna netAmount
"items/@com.sap.vocabularies.UI.v1.LineItem": {
    "columns": {
        "CustomPricingStatus": {
            "header"  : "{i18n>colPricingStatus}",
            "template": "com.my.sales.orders.ext.ItemPricingStatus",
            "position": { "placement": "After", "anchor": "DataField::netAmount" }
        }
    }
}
```

**Convenção de nome qualificado do fragment:**
```
<sap.app.id> + <caminho relativo a webapp sem extensão .fragment.xml>
com.my.sales.orders + ext/StatusBadge → com.my.sales.orders.ext.StatusBadge
```

**Anchor format:** `"DataField::<propertyName>"` para colunas `UI.DataField` simples. Para `DataFieldForAction`: `"DataFieldForAction::<ActionName>"`.

**Expression Binding vs. Formatter:** para lógica simples (ternário, comparações), Expression Binding `{= ...}` no XML elimina a necessidade de um arquivo formatter `.js` separado. Para lógica complexa (formatação de data, cálculos multi-campo), crie um formatter em `ext/formatter.js` e referencie com `core:require`.

**Regra de aprendizado:** Extension Points são o mecanismo do FE para escapar das limitações das anotações sem abandonar o padrão Fiori Elements. O backend não sabe que existem — são 100% client-side.

---

### 14.5 Resumo dos Artefatos Criados/Modificados

| Artefato | Tipo | Feature |
|---|---|---|
| [app/orders/annotations.cds](../app/orders/annotations.cds) §7 | modificado | `@Common.SideEffects` — 4 actions + 1 property trigger |
| [app/orders/annotations.cds](../app/orders/annotations.cds) §8 | modificado | `@UI.ConnectedFields` — OrderPeriod, QuantityWithUnit |
| [app/orders/annotations.cds](../app/orders/annotations.cds) §4–5 | modificado | `FieldGroup#HeaderDates` e `#ItemDetails` — referências aos ConnectedFields |
| [app/orders/webapp/manifest.json](../app/orders/webapp/manifest.json) | modificado | FCL (`sap.f.routing.Router`, array targets, `sap.f` lib) + `controlConfiguration` |
| [app/orders/webapp/ext/StatusBadge.fragment.xml](../app/orders/webapp/ext/StatusBadge.fragment.xml) | novo | Custom Column — ObjectStatus semântico no List Report |
| [app/orders/webapp/ext/ItemPricingStatus.fragment.xml](../app/orders/webapp/ext/ItemPricingStatus.fragment.xml) | novo | Custom Column — indicador de precificação na sub-tabela de itens |
| [app/orders/webapp/i18n/i18n.properties](../app/orders/webapp/i18n/i18n.properties) | modificado | Chaves `colStatusBadge`, `colPricingStatus`, labels dos ConnectedFields |

**Todos os 4 recursos são declarativos/configuração:** nenhuma linha de TypeScript foi alterada. O backend não percebe a diferença — as features são inteiramente na camada de apresentação.

---

---

## 15. Multi-Tenancy (SaaS)

Esta seção documenta a implementação do padrão Multi-Tenancy usando `@sap/cds-mtxs` (MTX = Multi-Tenancy eXtension), incluindo o Sidecar Pattern, isolamento de dados e o caminho para deploy SaaS no SAP BTP.

### 15.1 Conceito: Single-Tenant vs Multi-Tenant

| Aspecto | Single-Tenant (atual sem MTX) | Multi-Tenant (com MTX) |
|---|---|---|
| Banco de dados | 1 banco para todos | 1 banco **por tenant** |
| Dados | Compartilhados | Completamente isolados |
| Deploy | 1 instância | 1 instância, N tenants |
| Onboarding | Manual / sempre rodando | API de lifecycle automática |
| Modelo de negócio | Produto interno | **Produto SaaS vendável** |

**Tenant** = uma empresa/organização que assina o software como serviço. Cada tenant tem seus próprios dados, configurações e possivelmente extensões de modelo.

---

### 15.2 Arquitetura: Sidecar Pattern

O `@sap/cds-mtxs` implementa o padrão "Sidecar": um processo Node.js **separado** que gerencia o ciclo de vida dos tenants, sem interferir com a aplicação principal.

```
┌──────────────────────────────────────────────────────────────┐
│  Terminal 1: npm run dev:app   (porta 4004)                  │
│  ─────────────────────────────────────────────────────────   │
│  SalesOrderService    /api/orders                            │
│  SalesCatalogService  /api/catalog                           │
│  SalesAnalyticsService /api/analytics                        │
│                                                              │
│  Para requests com tenant:                                   │
│    X-Tenant-Id: acme  →  acme.db (SQLite local)             │
│    X-Tenant-Id: globo →  globo.db (SQLite local)            │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Terminal 2: npm run dev:mtx   (porta 4005)                  │
│  ─────────────────────────────────────────────────────────   │
│  SaasProvisioningService  /-/cds/saas-provisioning/          │
│  DeploymentService        /-/cds/deployment/                 │
│  ExtensibilityService     /-/cds/extensibility/              │
│                                                              │
│  Responsabilidades:                                          │
│    • Onboard tenant → cria banco SQLite (dev) / HDI (prod)  │
│    • Upgrade schema → migra todos os tenants após deploy     │
│    • Extensões      → aceita campos Z_ por tenant           │
└──────────────────────────────────────────────────────────────┘
```

**Por que processo separado?** O sidecar executa operações pesadas e raras (onboarding, migrações). Separar garante que um onboarding lento não degrada a API transacional.

---

### 15.3 Arquivos Implementados

| Artefato | Tipo | Responsabilidade |
|---|---|---|
| [srv/mtx/sidecar.ts](../srv/mtx/sidecar.ts) | novo | Ponto de entrada do MTX Sidecar |
| [package.json](../package.json) | modificado | `@sap/cds-mtxs` dep + scripts `dev:app`/`dev:mtx` |
| [.cdsrc.json](../.cdsrc.json) | modificado | `cds.xt.*` services + `multitenancy` + `cds.xt.linter` |
| [mta.yaml](../mta.yaml) | modificado | Módulo `cap-salesorder-ts-mtx` + recurso `cap-salesorder-sm` |
| [jest.config.js](../jest.config.js) | modificado | Projeto `main` (mock MTX) + projeto `multitenancy` |
| [test/multitenancy.test.ts](../test/multitenancy.test.ts) | novo | 14 testes de contexto, config e padrões MTX |
| [test/setup-env.ts](../test/setup-env.ts) | modificado | Documentação da estratégia de mock MTX |
| [test/__mocks__/cds-mtxs-noop.js](../test/__mocks__/cds-mtxs-noop.js) | novo | Mock vazio do plugin para testes não-MTX |

---

### 15.4 Como Executar Localmente

**Passo 1 — Iniciar o MTX Sidecar (Terminal 1):**
```bash
npm run dev:mtx
# → cds watch --port 4005 srv/mtx/sidecar.ts
# Output esperado:
# [cds] - serving cds.xt.SaasProvisioningService at /-/cds/saas-provisioning
# [cds] - serving cds.xt.DeploymentService at /-/cds/deployment
```

**Passo 2 — Iniciar a aplicação (Terminal 2):**
```bash
npm run dev:app
# → cds watch --port 4004
```

**Passo 3 — Onboarding de tenants:**
```bash
# Criar tenant "acme"
curl -X PUT http://localhost:4005/-/cds/saas-provisioning/tenant/acme \
     -H "Content-Type: application/json" \
     -d '{"subscribedSubdomain":"acme","subscribedTenantId":"acme"}'

# Criar tenant "globo"
curl -X PUT http://localhost:4005/-/cds/saas-provisioning/tenant/globo \
     -H "Content-Type: application/json" \
     -d '{"subscribedSubdomain":"globo","subscribedTenantId":"globo"}'
```

Resultado: dois bancos SQLite criados em `db/mtx/`:
```
db/mtx/acme.db    ← dados exclusivos do tenant acme
db/mtx/globo.db   ← dados exclusivos do tenant globo
```

**Passo 4 — Criar pedidos por tenant:**
```bash
# Pedido no tenant "acme"
curl -X POST http://localhost:4004/api/orders/SalesOrders \
     -H "Content-Type: application/json" \
     -H "X-Tenant-Id: acme" \
     -u alice:alice \
     -d '{"salesOrder":"ACME-001","orderDate":"2026-01-10","requestedDelivDate":"2026-02-10","pricingDate":"2026-01-10"}'

# Pedido no tenant "globo"
curl -X POST http://localhost:4004/api/orders/SalesOrders \
     -H "Content-Type: application/json" \
     -H "X-Tenant-Id: globo" \
     -u carol:carol \
     -d '{"salesOrder":"GLOBO-001","orderDate":"2026-01-15","requestedDelivDate":"2026-02-15","pricingDate":"2026-01-15"}'

# Verificar isolamento: acme NÃO vê pedidos do globo
curl http://localhost:4004/api/orders/SalesOrders \
     -H "X-Tenant-Id: acme" -u alice:alice
# → retorna apenas ACME-001, nunca GLOBO-001
```

**Passo 5 — Offboarding:**
```bash
curl -X DELETE http://localhost:4005/-/cds/saas-provisioning/tenant/acme
# → remove db/mtx/acme.db e todos os dados do tenant
```

---

### 15.5 Isolamento de Dados: Como Funciona

O CAP roteia automaticamente cada query para o banco correto com base no tenant do contexto:

```typescript
// O contexto de tenant é propagado pelo header X-Tenant-Id
// (ou pelo claim `tid` do JWT em produção BTP)

// cds.tx({ tenant }) cria um contexto explícito:
const tx = cds.tx({ tenant: 'acme' })
const orders = await tx.run(SELECT.from('SalesOrders'))
// → acessa APENAS db/mtx/acme.db

// Em dev: cada tenant tem seu próprio arquivo SQLite
// Em prod (HANA): cada tenant tem seu próprio HDI Container
```

**Verificado nos testes:**
```typescript
// test/multitenancy.test.ts — Suite 1
const tx = cds.tx({ tenant: 'acme' })
expect((tx as any).context?.tenant).toBe('acme')  // ✅ propagado corretamente
```

---

### 15.6 Extensibilidade por Tenant

O `@sap/cds-mtxs` permite que cada tenant adicione campos ao modelo base sem afetar outros tenants. Configurado em `.cdsrc.json`:

```json
"cds.xt.linter": {
    "element-prefix": "Z_",
    "extension-allowlist": [
        { "for": ["SalesOrderService.SalesOrders"], "new-fields": true }
    ]
}
```

Isso significa:
- Tenants podem adicionar campos `Z_*` à entidade `SalesOrders`
- Exemplo: tenant "acme" adiciona `Z_InternalCode` — só aparece no banco do "acme"
- O prefixo `Z_` evita conflitos com o modelo base (convenção SAP)

**API de extensão via MTX (quando sidecar rodando):**
```bash
# Tenant acme adiciona campo customizado
curl -X POST http://localhost:4005/-/cds/extensibility/Extensions \
     -H "Content-Type: application/json" \
     -H "X-Tenant-Id: acme" \
     -d '{
       "csn": {
         "extensions": [{
           "extend": "SalesOrderService.SalesOrders",
           "elements": {
             "Z_InternalCode": { "type": "cds.String", "length": 20 }
           }
         }]
       }
     }'
```

---

### 15.7 Estratégia de Testes (Jest Multi-Projeto)

O plugin `@sap/cds-mtxs` se auto-registra no boot de qualquer aplicação CAP. Para testes in-memory sem sidecar, isso causa erro (`getExtCsvs`). A solução é separar os testes em **dois projetos Jest**:

```javascript
// jest.config.js
module.exports = {
    projects: [
        {
            displayName: 'main',
            // Sales Order + Integration suites
            // @sap/cds-mtxs substituído por mock vazio
            moduleNameMapper: {
                '.*cds-mtxs.*': '<rootDir>/test/__mocks__/cds-mtxs-noop.js'
            }
        },
        {
            displayName: 'multitenancy',
            // Carrega @sap/cds-mtxs real (sem cds.test() — sem servidor)
        }
    ]
}
```

**O mock (`test/__mocks__/cds-mtxs-noop.js`)** exporta `{}` — um módulo completamente vazio que satisfaz o `require` sem registrar nenhum handler.

**Os 14 testes de multitenancy** validam:
- Propagação de contexto de tenant via `cds.tx({ tenant })`
- Configuração do `cds.env` (serviços MTX declarados)
- Padrões estruturais (scripts, arquivos, URLs)
- Não requerem servidor nem sidecar — são testes de "documentação executável"

---

### 15.8 Deploy no SAP BTP (quando disponível)

O `mta.yaml` foi atualizado com dois novos elementos:

**Módulo `cap-salesorder-ts-mtx`:**
```yaml
- name: cap-salesorder-ts-mtx
  type: nodejs
  path: gen/srv
  provides:
    - name: mtx-api
      properties:
        mtx-url: ${default-url}
  requires:
    - name: cap-salesorder-db
    - name: cap-salesorder-auth
    - name: cap-salesorder-sm      # Service Manager para HDI por tenant
```

**Recurso `cap-salesorder-sm` (SAP Service Manager):**
```yaml
- name: cap-salesorder-sm
  type: org.cloudfoundry.managed-service
  parameters:
    service:      service-manager
    service-plan: container
```

**XSUAA `tenant-mode: shared`** — alterado de `dedicated` para `shared`, necessário para SaaS multitenancy.

**Fluxo de onboarding em produção BTP:**
```
Tenant compra a solução
    ↓
SAP SaaS Provisioning Service chama:
    PUT /-/cds/saas-provisioning/tenant/{tenantId}
        ↓
MTX Sidecar (cap-salesorder-ts-mtx):
    1. Cria HDI Container via Service Manager
    2. Deploy do schema HANA para o novo tenant
    3. Retorna 200 OK → tenant ativo
        ↓
Tenant acessa a aplicação com JWT contendo tid={tenantId}
```

---

### 15.9 Lição-Chave: Por que Multi-Tenancy Importa

**Sem multi-tenancy:** você entrega um produto que o cliente instala/hospeda sozinho (CapEx). Cada cliente = um deploy separado.

**Com multi-tenancy:** você entrega um produto SaaS que N clientes usam simultaneamente em uma única instância (OpEx). O `@sap/cds-mtxs` cuida de:
- Provisionar banco por cliente (HDI Container HANA)
- Migrar schema de TODOS os clientes após cada nova versão
- Permitir que cada cliente customize o modelo sem afetar os outros
- Garantir isolamento total de dados por contrato (LGPD/GDPR)

O CAP MTX transforma um projeto de domínio em um produto SaaS sem mudar uma linha dos handlers de negócio — o isolamento é infraestrutura, não código de aplicação.

---

*Documentação atualizada em 2026-04-11 | Projeto: cap-salesorder-ts-learning v1.0.0*

**Alterações desta revisão:** estrutura de diretórios atualizada (camada de integração), seção 5 expandida com sub-handlers, `billingStatusLabel`, entidades shadow, camada de integração completa (seção 5.8 e 5.9), fluxo de importação (6.4), endpoints de integração (7.4), suíte de testes atualizada (8.1), melhorias marcadas como implementadas (10.2, 10.3, 10.5), lições aprendidas FIX-12 a FIX-14.
