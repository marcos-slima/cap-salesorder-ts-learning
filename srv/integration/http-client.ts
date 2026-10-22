/**
 * ═══════════════════════════════════════════════════════════════════
 *  FILE  : srv/integration/http-client.ts
 *  LAYER : Integration — HTTP Abstraction Layer
 *
 *  Why a wrapper instead of calling axios directly?
 *  ─────────────────────────────────────────────────
 *  1. Testability — the HttpClient interface can be replaced with a
 *     mock in unit tests without patching module internals.
 *
 *  2. Centralised error handling — all non-2xx responses are
 *     converted to a typed HttpError before reaching the callers.
 *
 *  3. Structured logging — every outbound request is logged at
 *     DEBUG level with URL, method, and duration so that integration
 *     issues can be diagnosed from the CAP log stream without
 *     enabling verbose axios interceptors.
 *
 *  4. No SAP Connectivity Service dependency — direct axios calls
 *     work on BTP Trial and localhost without destinations.
 *     Replace this module with a SAP Cloud SDK destination-aware
 *     client when deploying to a Connected Landscape.
 *
 *  Usage
 *  ─────
 *  Production:  new AxiosHttpClient()
 *  Unit tests:  new MockHttpClient({ url → responsePayload })
 * ═══════════════════════════════════════════════════════════════════
 */

import cds from '@sap/cds'

const LOG = cds.log('http-client')


// ──────────────────────────────────────────────────────────────────
//  Public interface — callers depend on this, not on axios
// ──────────────────────────────────────────────────────────────────

export interface HttpResponse<T = unknown> {
  status:  number
  headers: Record<string, string>
  data:    T
}

export interface HttpClient {
  get<T = unknown>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>>
}


// ──────────────────────────────────────────────────────────────────
//  Typed error — wraps non-2xx responses
// ──────────────────────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(
    public readonly status:  number,
    public readonly url:     string,
    message:                 string
  ) {
    super(`HTTP ${status} from ${url}: ${message}`)
    this.name = 'HttpError'
  }
}


// ──────────────────────────────────────────────────────────────────
//  AxiosHttpClient — production implementation
// ──────────────────────────────────────────────────────────────────

/**
 * Production HTTP client using axios.
 *
 * axios is already a transitive dependency of @cap-js/cds-test;
 * no additional package.json entry needed for the server runtime.
 * If `require('axios')` fails in a stripped production bundle,
 * add axios as an explicit dependency.
 */
export class AxiosHttpClient implements HttpClient {

  async get<T = unknown>(
    url:     string,
    headers: Record<string, string> = {}
  ): Promise<HttpResponse<T>> {
    // Dynamic require keeps axios optional — avoids bundling it when
    // a mock client is injected in tests.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axiosModule = require('axios') as unknown as { default?: unknown; [key: string]: unknown }
    const axios = (axiosModule.default ?? axiosModule) as unknown as unknown

    const start = Date.now()
    LOG.debug(`GET ${url}`)

    try {
      const resp = await (axios as any).get(url, {
        headers: {
          Accept:  'application/json',
          ...headers
        },
        // 15 s timeout — avoids hanging tests or prod requests
        timeout: 15_000,
        // Do not throw on non-2xx; we handle status codes ourselves
        validateStatus: () => true
      })

      const duration = Date.now() - start
      LOG.debug(`GET ${url} → ${resp.status} (${duration}ms)`)

      if (resp.status < 200 || resp.status >= 300) {
        throw new HttpError(resp.status, url,
          typeof resp.data === 'string'
            ? resp.data.slice(0, 200)
            : JSON.stringify(resp.data).slice(0, 200)
        )
      }

      return {
        status:  resp.status,
        headers: resp.headers as Record<string, string>,
        data:    resp.data
      }

    } catch (err) {
      if (err instanceof HttpError) throw err
      // Network-level error (ECONNREFUSED, ETIMEDOUT, etc.)
      throw new HttpError(0, url, (err as Error).message)
    }
  }
}


// ──────────────────────────────────────────────────────────────────
//  MockHttpClient — test / offline implementation
// ──────────────────────────────────────────────────────────────────

/**
 * Mock HTTP client for unit tests and offline development.
 *
 * Usage:
 *   const mock = new MockHttpClient()
 *   mock.register('https://example.com/data', { value: [{ id: 1 }] })
 *   const client: HttpClient = mock
 *
 * URL matching uses `String.includes()` so you can register a partial
 * URL (e.g. '/Orders') and it will match any full URL containing it.
 * The first registered pattern that matches is used.
 */
export class MockHttpClient implements HttpClient {

  private readonly routes = new Map<string, unknown>()

  /** Register a URL pattern → response payload. */
  register(urlPattern: string, responseData: unknown): this {
    this.routes.set(urlPattern, responseData)
    return this
  }

  async get<T = unknown>(url: string): Promise<HttpResponse<T>> {
    for (const [pattern, data] of this.routes) {
      if (url.includes(pattern)) {
        LOG.debug(`[MOCK] GET ${url} → matched '${pattern}'`)
        return { status: 200, headers: {}, data: data as T }
      }
    }
    throw new HttpError(404, url,
      `MockHttpClient: no route registered for '${url}'. ` +
      `Registered patterns: ${[...this.routes.keys()].join(', ')}`
    )
  }
}
