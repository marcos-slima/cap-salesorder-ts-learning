/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : db/masterdata/master-data.cds
 *  LAYER : Domain Model — Master Data (Supporting Sub-domain)
 *
 *  DDD classification: Supporting Sub-domain
 *  ──────────────────────────────────────────
 *  Master data entities are NOT part of the Sales Core domain.
 *  They belong to a Supporting sub-domain (Product, Partner,
 *  OrgStructure) that the Sales aggregate references but does not
 *  own.  In a full microservice landscape these would be separate
 *  CAP services; here they are co-located for the study context.
 *
 *  Integration strategy
 *  ─────────────────────
 *  In production the Sales service would NOT replicate product or
 *  business partner data.  Instead it would:
 *    • Reference them by key (association pointing to a remote
 *      service or S/4HANA via CDS remote service definition).
 *    • Cache read-only data via SAP Integration Suite replication
 *      flows into local shadow entities (this file's entities
 *      serve that shadow role).
 *
 *  Extensibility (Clean Core)
 *  ──────────────────────────
 *  Every entity is annotated @cds.persistence.skip: false so that
 *  CAP creates the backing HANA table.  Extension fields MUST be
 *  added via CDS extension projects (side-by-side), never by
 *  modifying this file directly.  Extension example:
 *
 *    extend com.my.sales.Products with {
 *        hazmatClass : String(2);
 *    }
 * ═══════════════════════════════════════════════════════════════════
 */

namespace com.my.sales;

using { Language, Country, managed, cuid,
        sap.common.CodeList }           from '@sap/cds/common';
using { com.my.sales.ProductCode,
        com.my.sales.SalesOrgCode,
        com.my.sales.BusinessPartner} from '../types/common-types';
using { com.my.sales.Monetized }        from '../aspects/domain-aspects';


// ══════════════════════════════════════════════════════════════════
//  CODE LISTS  (lightweight supporting entities)
// ══════════════════════════════════════════════════════════════════

/**
 * SalesOrderTypes — AUART
 * Extends sap.common.CodeList → inherits key `code`, localized
 * `name`, localized `descr`, and the `@cds.autoexpose` flag.
 * No additional fields needed; the base code list is sufficient.
 */
@readonly
entity SalesOrderTypes : CodeList {
    key code : String(4);
}

/**
 * DistributionChannels — VTWEG
 */
@readonly
entity DistributionChannels : CodeList {
    key code : String(2);
}

/**
 * Divisions — SPART
 */
@readonly
entity Divisions : CodeList {
    key code : String(2);
}

/**
 * ScheduleLineCategories — LKTYP / ETYPE
 * Own code list for schedule line types so that new categories
 * can be added by configuration, not code change.
 */
@readonly
entity ScheduleLineCategories : CodeList {
    key code : String(2);
}

/**
 * ConditionTypes — KSCHL
 * Pricing condition catalogue (PR00, K007, MWST, etc.).
 * The `calculationType` here is the *default* for the condition;
 * actual items may override it.
 */
@readonly
entity ConditionTypes : CodeList {
    key code            : String(4);    // KSCHL
    calculationType     : String(1);    // KRECH default
    statisticalFlag     : Boolean;      // KSTAT
}


// ══════════════════════════════════════════════════════════════════
//  ORGANISATIONAL STRUCTURE
// ══════════════════════════════════════════════════════════════════

/**
 * SalesOrganizations — VKORG
 *
 * `localized` on name generates a _texts companion table so that
 * the org name can be displayed in the user's logon language.
 *
 * NOTE: In an S/4HANA integration scenario this entity would be
 *       populated by a CPI/Integration Suite replication flow
 *       reading from VKORG via the OrgManagement OData API.
 */
@cds.autoexpose
@readonly
entity SalesOrganizations : managed, cuid {
    @mandatory
    code    : SalesOrgCode;
    name    : localized String(60);
    country : Country;
}

/**
 * SalesAreas — composite org unit (VKORG + VTWEG + SPART).
 * Modelled explicitly so that service projections can use it
 * as a single navigation target instead of three separate FKs.
 */
@cds.autoexpose
@readonly
entity SalesAreas : managed, cuid {
    salesOrganization   : Association to one SalesOrganizations;
    distributionChannel : Association to one DistributionChannels;
    division            : Association to one Divisions;
    name                : localized String(60);
}


// ══════════════════════════════════════════════════════════════════
//  BUSINESS PARTNERS
// ══════════════════════════════════════════════════════════════════

/**
 * BusinessPartners — simplified shadow of SAP BP master (BUT000).
 *
 * Only the fields required by the Sales aggregate are kept here.
 * Full partner data lives in SAP MDG or S/4HANA and is exposed
 * to this service via a CDS remote service definition or a
 * Integration Suite replication.
 *
 * The `roles` composition allows a partner to play multiple
 * functions on the same order (sold-to, ship-to, bill-to, payer)
 * without duplicating the master record.
 */
// @cap-js/audit-logging — marca esta entidade como DataSubject (GDPR).
// O plugin intercepta automaticamente todo READ/WRITE e grava no
// SAP Audit Log Service (produção) ou no log local (desenvolvimento).
// Não requer nenhum handler manual — apenas anotações @PersonalData.
//
// Vocabulário usado:
//   @PersonalData.EntitySemantics: 'DataSubject'
//     → esta entidade representa uma pessoa física ou jurídica cujos
//       dados devem ser auditados (art. 30 GDPR — registro de atividade)
//
//   @PersonalData.FieldSemantics: 'DataSubjectID'
//     → campo que identifica unicamente o titular dos dados
//       (usado como chave no log: "quem foi lido/modificado")
//
//   @PersonalData.IsPotentiallyPersonal
//     → campo contém dado pessoal — toda leitura gera entrada de audit
//
//   @PersonalData.IsPotentiallySensitive
//     → dado sensível (financeiro, fiscal) — log adicional de acesso
@cds.autoexpose
@PersonalData.EntitySemantics: 'DataSubject'
entity BusinessPartners : managed, cuid {
    @mandatory
    @PersonalData.FieldSemantics: 'DataSubjectID'
    code        : BusinessPartner;

    @PersonalData.IsPotentiallyPersonal
    name        : String(80);

    @PersonalData.IsPotentiallyPersonal
    name2       : String(40);       // second name line

    country     : Country;
    language    : Language;

    @PersonalData.IsPotentiallySensitive
    taxNumber1  : String(20);       // local tax ID (STCD1)

    blocked     : Boolean default false; // AUFSD / LIFSP
}

/**
 * BusinessPartnerAddresses — ADRC shadow.
 * Owned by the partner (Composition) — deleted with partner.
 *
 * @PersonalData.EntitySemantics: 'DataSubjectDetails'
 *   → entidade relacionada ao DataSubject (BusinessPartners).
 *     O plugin liga automaticamente os logs pelo subject_ID (code).
 */
@PersonalData.EntitySemantics: 'DataSubjectDetails'
entity BusinessPartnerAddresses : managed, cuid {
    @PersonalData.FieldSemantics: 'DataSubjectID'
    partner         : Association to one BusinessPartners;

    addressType     : String(10);   // BILL / SHIP / DEFAULT

    @PersonalData.IsPotentiallyPersonal
    street          : String(60);

    @PersonalData.IsPotentiallyPersonal
    city            : String(40);

    @PersonalData.IsPotentiallyPersonal
    postalCode      : String(10);

    country         : Country;
    isDefault       : Boolean default false;
}


// ══════════════════════════════════════════════════════════════════
//  PRODUCT CATALOGUE
// ══════════════════════════════════════════════════════════════════

/**
 * ProductTypes — material type (MTART).
 * Back-association to Products is intentionally omitted here
 * to keep the type entity lightweight.  Queries should go the
 * other way: Products[type.code = 'FERT'].
 */
@cds.autoexpose
@readonly
entity ProductTypes : CodeList {
    key code : String(4);
}

/**
 * Products — material master shadow (MARA + MAKT).
 *
 * `localized String` on name and description auto-generates
 * a Products_texts table with columns (locale, name, description).
 * CAP resolves the correct language at runtime using the
 * Accept-Language header — no explicit join needed in projections.
 *
 * @assert.unique on the business key `code` prevents duplicate
 * material numbers while the surrogate UUID key (from cuid)
 * keeps associations stable even if the material number changes.
 */
@cds.autoexpose
@assert.unique: { matnr: [code] }
entity Products : managed, cuid {
    @description    : 'Material number (MATNR)'
    @mandatory
    code            : ProductCode;

    @Common.Label   : 'Product Name'
    name            : localized String(40);     // MAKTX

    @Common.Label   : 'Description'
    description     : localized String(255);    // MAKTX long

    type            : Association to one ProductTypes;

    /** Base unit of measure (MEINS) */
    @Common.Label   : 'Base Unit of Measure'
    baseUnit        : String(3);

    /** Authorization group (BEGRU) — restricts who can price/order */
    @UI.Hidden
    authorizationGroup : String(4);

    /**
     * Prices is a Composition so that the price lifecycle is
     * fully owned by the product.  Multiple price records allow
     * currency-specific and date-effective pricing.
     */
    prices          : Composition of many ProductPrices
                          on prices.product = $self;
}

/**
 * ProductPrices — date-effective, currency-specific list prices.
 *
 * Composition child of Products.  Extends Monetized to inherit
 * the @Measures.ISOCurrency annotation correctly.
 *
 * The `validFrom` / `validTo` pair enables temporal queries:
 *   SELECT FROM ProductPrices WHERE validFrom <= $now
 *                               AND (validTo IS NULL OR validTo >= $now)
 */
entity ProductPrices : managed, Monetized {
    key product : Association to one Products;
    key priceType   : String(4) default 'LIST';  // LIST / SALE / COST
    key validFrom   : Date;
    validTo         : Date;
}
