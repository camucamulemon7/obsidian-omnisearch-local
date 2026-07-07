/* eslint-disable import/no-nodejs-modules */
import * as http from 'http'
import * as os from 'os'
import * as url from 'url'
import { Notice } from 'obsidian'
import type { ResultNote } from '../globals'
import type OmnisearchPlugin from '../main'
import { Query } from '../search/query'

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

type SearchRequest = {
  query?: unknown
  limit?: unknown
  includeContent?: unknown
}

type ReadRequest = {
  path?: unknown
}

function setCorsHeaders(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const requestedHeaders = req.headers['access-control-request-headers']

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    Array.isArray(requestedHeaders)
      ? requestedHeaders.join(', ')
      : requestedHeaders ||
          'Authorization, Content-Type, X-API-Key, X-Session-Id, Accept'
  )
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
}

function writeJson(
  res: http.ServerResponse,
  statusCode: number,
  body: JsonValue
): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function isAuthorized(
  req: http.IncomingMessage,
  apiKey: string | undefined
): boolean {
  if (!apiKey) return false
  const authorization = req.headers.authorization
  const xApiKey = req.headers['x-api-key']
  return (
    authorization === `Bearer ${apiKey}` ||
    xApiKey === apiKey ||
    (Array.isArray(xApiKey) && xApiKey.includes(apiKey))
  )
}

async function readJsonBody(req: http.IncomingMessage): Promise<SearchRequest> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? (JSON.parse(raw) as SearchRequest) : {}
}

function asPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(Math.floor(parsed), max))
}

function makeExcerpt(plugin: OmnisearchPlugin, result: ResultNote): string {
  return plugin.textProcessor.makeExcerpt(
    result.content,
    result.matches[0]?.offset ?? -1
  )
}

function normalizeResult(
  plugin: OmnisearchPlugin,
  result: ResultNote,
  includeContent: boolean
): JsonValue {
  return {
    path: result.path,
    title: result.displayTitle || result.basename,
    basename: result.basename,
    score: result.score,
    foundWords: result.foundWords,
    matches: result.matches.map(match => ({
      match: match.match,
      offset: match.offset,
    })),
    isEmbed: result.isEmbed,
    excerpt: makeExcerpt(plugin, result),
    contentLength: result.content.length,
    contentIncluded: includeContent,
    content: includeContent ? result.content : null,
  }
}

async function readDocument(
  plugin: OmnisearchPlugin,
  path: string
): Promise<JsonValue> {
  const document = await plugin.documentsRepository.getDocument(path)

  return {
    path: document.path,
    title: document.displayTitle || document.basename,
    basename: document.basename,
    mtime: document.mtime,
    tags: document.tags,
    aliases: document.aliases,
    headings1: document.headings1,
    headings2: document.headings2,
    headings3: document.headings3,
    contentLength: document.content.length,
    content: document.content,
  }
}

function getLanIpAddress(): string {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address
      }
    }
  }
  return '127.0.0.1'
}

function getAdvertisedHost(host: string): string {
  return host === '0.0.0.0' ? getLanIpAddress() : host
}

async function search(
  plugin: OmnisearchPlugin,
  queryText: string,
  limit: number,
  includeContent: boolean
): Promise<JsonValue> {
  const query = new Query(queryText, {
    ignoreDiacritics: plugin.settings.ignoreDiacritics,
    ignoreArabicDiacritics: plugin.settings.ignoreArabicDiacritics,
  })
  const results = await plugin.searchEngine.getSuggestions(query)
  return results
    .slice(0, limit)
    .map(result => normalizeResult(plugin, result, includeContent))
}

function getOpenApiDocument(plugin: OmnisearchPlugin): JsonValue {
  const baseUrl = `http://${getAdvertisedHost(plugin.settings.aiToolHost)}:${plugin.settings.aiToolPort}`
  return {
    openapi: '3.0.3',
    info: {
      title: 'Omnisearch AI Tool Server',
      version: '0.1.0',
      description:
        'Search the local Obsidian vault through Omnisearch. Obsidian must be running and indexed.',
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    paths: {
      '/health': {
        get: {
          operationId: 'omnisearch_health',
          summary: 'Check whether Omnisearch is reachable',
          security: [],
          responses: {
            '200': {
              description: 'Server status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      vault: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/search': {
        post: {
          operationId: 'omnisearch_search',
          summary: 'Search the Obsidian vault with Omnisearch',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['query'],
                  properties: {
                    query: {
                      type: 'string',
                      description: 'Search query to send to Omnisearch.',
                    },
                    limit: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 50,
                      default: 10,
                    },
                    includeContent: {
                      type: 'boolean',
                      default: true,
                      description:
                        'Include full indexed content in each search result. Set false for compact search results.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                        title: { type: 'string' },
                        basename: { type: 'string' },
                        score: { type: 'number' },
                        foundWords: { type: 'array', items: { type: 'string' } },
                        matches: { type: 'array', items: { type: 'object' } },
                        isEmbed: { type: 'boolean' },
                        excerpt: { type: 'string' },
                        contentLength: { type: 'integer' },
                        contentIncluded: { type: 'boolean' },
                        content: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/document': {
        post: {
          operationId: 'omnisearch_read',
          summary: 'Read the full indexed content of an Obsidian vault file',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['path'],
                  properties: {
                    path: {
                      type: 'string',
                      description:
                        'Vault-relative file path returned by omnisearch_search.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Indexed document content',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      path: { type: 'string' },
                      title: { type: 'string' },
                      basename: { type: 'string' },
                      mtime: { type: 'number' },
                      tags: { type: 'array', items: { type: 'string' } },
                      aliases: { type: 'string' },
                      headings1: { type: 'string' },
                      headings2: { type: 'string' },
                      headings3: { type: 'string' },
                      contentLength: { type: 'integer' },
                      content: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

export function getAiToolServer(plugin: OmnisearchPlugin) {
  let server: http.Server | null = null

  return {
    listen(port: string, host: string) {
      this.close()
      server = http.createServer(async (req, res) => {
        setCorsHeaders(req, res)

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        try {
          const parsedUrl = url.parse(req.url ?? '/', true)

          if (req.method === 'GET' && parsedUrl.pathname === '/health') {
            writeJson(res, 200, {
              ok: true,
              vault: plugin.app.vault.getName(),
            })
            return
          }

          if (req.method === 'GET' && parsedUrl.pathname === '/openapi.json') {
            writeJson(res, 200, getOpenApiDocument(plugin))
            return
          }

          if (
            (req.method === 'POST' || req.method === 'GET') &&
            parsedUrl.pathname === '/search'
          ) {
            if (!isAuthorized(req, plugin.settings.aiToolApiKey)) {
              writeJson(res, 401, { error: 'Unauthorized' })
              return
            }

            const body =
              req.method === 'POST' ? await readJsonBody(req) : {}
            const queryText =
              typeof body.query === 'string'
                ? body.query
                : String(parsedUrl.query?.q ?? '')
            if (!queryText.trim()) {
              writeJson(res, 400, { error: 'Missing query' })
              return
            }

            const limit = asPositiveInt(
              body.limit ?? parsedUrl.query?.limit,
              10,
              50
            )
            const includeContent =
              body.includeContent !== false &&
              parsedUrl.query?.includeContent !== 'false'
            writeJson(
              res,
              200,
              await search(plugin, queryText, limit, includeContent)
            )
            return
          }

          if (
            (req.method === 'POST' || req.method === 'GET') &&
            parsedUrl.pathname === '/document'
          ) {
            if (!isAuthorized(req, plugin.settings.aiToolApiKey)) {
              writeJson(res, 401, { error: 'Unauthorized' })
              return
            }

            const body =
              req.method === 'POST'
                ? ((await readJsonBody(req)) as ReadRequest)
                : {}
            const path =
              typeof body.path === 'string'
                ? body.path
                : String(parsedUrl.query?.path ?? '')
            if (!path.trim()) {
              writeJson(res, 400, { error: 'Missing path' })
              return
            }

            writeJson(res, 200, await readDocument(plugin, path))
            return
          }

          writeJson(res, 404, { error: 'Not found' })
        } catch (error) {
          writeJson(res, 500, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      })

      server.on('error', e => {
        console.error(e)
        new Notice(
          `Omnisearch - Cannot start AI tool server on ${host}:${port}. See console for more details.`
        )
      })

      server.listen(
        {
          port: parseInt(port),
          host,
        },
        () => {
          console.log(
            `Omnisearch - Started AI tool server on ${host}:${port}`
          )
          new Notice(
            `Omnisearch - Started AI tool server on ${host}:${port}`
          )
        }
      )
    },
    close() {
      if (!server) return
      server.close()
      server = null
      console.log('Omnisearch - Terminated AI tool server')
    },
  }
}

export type AiToolServer = ReturnType<typeof getAiToolServer>
