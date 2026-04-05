import type { Plugin } from 'vite'
import type { PluginContext } from './types'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path'
import { transformSync } from 'esbuild'
import appServer from './app-server'
import browserLauncher from './browser-launcher'

type PluginFactory =
  | Plugin
  | null
  | undefined
  | ((ctx: PluginContext) => Plugin | Plugin[] | null | undefined | Promise<Plugin | Plugin[] | null | undefined>)

type DefaultPluginFactory = (ctx: PluginContext) => Plugin | null

// Add default always-on plugins here.
const DEFAULT_PLUGIN_FACTORIES: DefaultPluginFactory[] = [
  (ctx) => appServer(ctx),
  () => browserLauncher(),
]

const LOADABLE_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'] as const
const moduleCache = new Map<string, unknown>()

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')
}

function resolveLocalModulePath(specifier: string, fromFile: string): string | null {
  const baseDir = dirname(fromFile)
  const basePath = isAbsolute(specifier) ? specifier : resolve(baseDir, specifier)

  const directExt = extname(basePath).toLowerCase()
  const candidates = directExt
    ? [basePath]
    : [
        ...LOADABLE_EXTENSIONS.map((ext) => `${basePath}${ext}`),
        ...LOADABLE_EXTENSIONS.map((ext) => resolve(basePath, `index${ext}`)),
      ]

  for (const candidate of candidates) {
    try {
      const stat = lstatSync(candidate)
      if (stat.isFile() || stat.isSymbolicLink()) {
        return candidate
      }
    } catch {
      // Not loadable, move to next candidate.
    }
  }

  return null
}

function readModuleExports(absPath: string): unknown {
  const realPath = realpathSync(absPath)
  const cached = moduleCache.get(realPath)
  if (cached !== undefined) {
    return cached
  }

  const source = readFileSync(realPath, 'utf8')
  const extension = extname(realPath).toLowerCase()
  const loader = extension === '.ts' ? 'ts' : 'js'
  const transformed = transformSync(source, {
    loader,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: false,
  })

  const module = { exports: {} as unknown }
  moduleCache.set(realPath, module.exports)

  const localRequire = createRequire(realPath)
  const runtimeRequire = (specifier: string): unknown => {
    const localPath = isRelativeSpecifier(specifier) ? resolveLocalModulePath(specifier, realPath) : null
    if (localPath) {
      return readModuleExports(localPath)
    }
    return localRequire(specifier)
  }

  const wrapped = new Function(
    'require',
    'module',
    'exports',
    '__filename',
    '__dirname',
    transformed.code,
  )
  wrapped(runtimeRequire, module, module.exports, realPath, dirname(realPath))
  moduleCache.set(realPath, module.exports)

  return module.exports
}

function normalizeModuleDefault(moduleExports: unknown): PluginFactory {
  if (
    moduleExports &&
    typeof moduleExports === 'object' &&
    'default' in (moduleExports as Record<string, unknown>)
  ) {
    return (moduleExports as { default: PluginFactory }).default
  }
  return moduleExports as PluginFactory
}

async function evaluatePluginModule(absPath: string, ctx: PluginContext): Promise<Plugin[]> {
  const entry = normalizeModuleDefault(readModuleExports(absPath))
  const resolved = typeof entry === 'function' ? await entry(ctx) : entry
  if (!resolved) {
    return []
  }

  return (Array.isArray(resolved) ? resolved : [resolved]).filter((plugin): plugin is Plugin => plugin !== null)
}

function discoverSelectedRootPluginFiles(ctx: PluginContext): string[] {
  if (!ctx.selectedApp) {
    return []
  }

  const rootDir = __dirname
  return LOADABLE_EXTENSIONS
    .map((ext) => resolve(rootDir, `${ctx.selectedApp}-plugin${ext}`))
    .filter((absPath) => {
      try {
        const stat = lstatSync(absPath)
        return stat.isFile() || stat.isSymbolicLink()
      } catch {
        return false
      }
    })
}

function discoverSelectedAppPluginFile(ctx: PluginContext): string[] {
  if (!ctx.selectedAppDir) {
    return []
  }

  const candidates = ['vite-plugin.ts', 'vite-plugin.js', 'vite-plugin.mjs', 'vite-plugin.cjs']
    .map((name) => resolve(ctx.selectedAppDir as string, name))
    .filter((absPath) => {
      try {
        const stat = lstatSync(absPath)
        return stat.isFile() || stat.isSymbolicLink()
      } catch {
        return false
      }
    })

  return candidates
}

function dedupeRealpaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const absPath of paths) {
    let realPath = absPath
    try {
      realPath = realpathSync(absPath)
    } catch {
      // Keep original path if realpath cannot be resolved.
    }

    if (seen.has(realPath)) {
      continue
    }
    seen.add(realPath)
    unique.push(absPath)
  }

  return unique
}

export async function loadAppPlugins(ctx: PluginContext): Promise<Plugin[]> {
  const defaults: Plugin[] = DEFAULT_PLUGIN_FACTORIES
    .map((createPlugin) => createPlugin(ctx))
    .filter((p): p is Plugin => p !== null)

  const discoveredFiles = dedupeRealpaths([
    ...discoverSelectedRootPluginFiles(ctx),
    ...discoverSelectedAppPluginFile(ctx),
  ])

  const discoveredPlugins: Plugin[] = []
  for (const absPath of discoveredFiles) {
    try {
      const loaded = await evaluatePluginModule(absPath, ctx)
      discoveredPlugins.push(...loaded)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`[vite-plugins] Failed to load ${basename(absPath)}: ${reason}`)
    }
  }

  return [...defaults, ...discoveredPlugins]
}
