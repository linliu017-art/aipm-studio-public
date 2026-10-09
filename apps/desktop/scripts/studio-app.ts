/** Install Nini Flow.app: a local macOS bundle that runs this checkout's Desktop shell outside development mode settings. */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import type { DesktopRelease } from '../src/release.ts'
import { NINI_FLOW_HOME } from '../src/aipm-home.ts'
import { developmentRuntimeDirectory, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'
import { prepareDevelopmentProject } from './development-project.ts'
import { preparePrimaryRuntime } from './prepare-primary-runtime.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')
const DEVELOPMENT_ROOT = join(APP_ROOT, '.desktop-build', 'development')
const PRODUCT_NAME = 'Nini Flow'
const BUNDLE_ID = 'com.linliu.aipm-studio'
const BUNDLE = join(homedir(), 'Applications', `${PRODUCT_NAME}.app`)
const USER_DATA = join(homedir(), 'Library', 'Application Support', PRODUCT_NAME)

function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'` }

function packageVersion(path: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error(`studio app: ${path} has no version`)
  return manifest.version
}

function writeIcon(resources: string): void {
  const iconset = join(mkdtempSync(join(tmpdir(), 'aipm-icon-')), 'icon.iconset')
  mkdirSync(iconset)
  const source = join(APP_ROOT, 'resources', 'icon-macos.png')
  for (const size of [16, 32, 128, 256, 512]) {
    execFileSync('/usr/bin/sips', ['-z', String(size), String(size), source, '--out', join(iconset, `icon_${size}x${size}.png`)], { stdio: 'pipe' })
    execFileSync('/usr/bin/sips', ['-z', String(size * 2), String(size * 2), source, '--out', join(iconset, `icon_${size}x${size}@2x.png`)], { stdio: 'pipe' })
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(resources, 'electron.icns')])
  rmSync(dirname(iconset), { recursive: true, force: true })
}

function launcher(electronInBundle: string): string {
  const environment = {
    DSH_HOME: NINI_FLOW_HOME,
    DSH_DESKTOP_PRIMARY_RUNTIME_DIR: developmentRuntimeDirectory(),
    DSH_DESKTOP_OPEN_DEVTOOLS: '0',
  }
  return [
    '#!/bin/sh',
    ...Object.entries(environment).map(([key, value]) => `export ${key}=${quote(value)}`),
    `cd ${quote(APP_ROOT)}`,
    `exec ${quote(electronInBundle)} ${quote(`--user-data-dir=${USER_DATA}`)} ${quote(APP_ROOT)} "$@"`,
    '',
  ].join('\n')
}

function installBundle(electron: string): void {
  const source = dirname(dirname(dirname(electron)))
  rmSync(BUNDLE, { recursive: true, force: true })
  mkdirSync(dirname(BUNDLE), { recursive: true })
  execFileSync('/usr/bin/ditto', [source, BUNDLE])
  const plist = join(BUNDLE, 'Contents', 'Info.plist')
  const values = {
    CFBundleIdentifier: BUNDLE_ID,
    CFBundleName: PRODUCT_NAME,
    CFBundleDisplayName: PRODUCT_NAME,
    CFBundleExecutable: 'NiniFlow',
    CFBundleShortVersionString: packageVersion(join(APP_ROOT, 'package.json')),
  }
  for (const [key, value] of Object.entries(values)) {
    execFileSync('/usr/bin/plutil', ['-replace', key, '-json', JSON.stringify(value), plist])
  }
  spawnSync('/usr/bin/plutil', ['-remove', 'CFBundleURLTypes', plist], { stdio: 'ignore' })
  writeIcon(join(BUNDLE, 'Contents', 'Resources'))
  writeFileSync(join(BUNDLE, 'Contents', 'MacOS', 'NiniFlow'), launcher(join(BUNDLE, 'Contents', 'MacOS', 'Electron')), { mode: 0o755 })
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', BUNDLE], { stdio: 'pipe' })
  execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', BUNDLE])
}

async function main(): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('studio app: macOS only')
  for (const path of [join(APP_ROOT, 'lib', 'main.js'), join(REPOSITORY_ROOT, 'apps', 'desktop-host', 'lib', 'index.js')]) {
    if (!existsSync(path)) throw new Error(`studio app: missing built artifact ${path}; run pnpm run build at the repository root and in apps/desktop first`)
  }
  const require = createRequire(import.meta.url)
  const electron: unknown = require('electron')
  if (typeof electron !== 'string') throw new Error('studio app: electron executable is unavailable')
  const release: DesktopRelease = {
    schemaVersion: 1,
    version: packageVersion(join(APP_ROOT, 'package.json')),
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: execFileSync(electron, ['-p', 'process.versions.node'],
      { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).trim(),
    pnpmVersion: packageVersion(join(APP_ROOT, 'node_modules', 'pnpm', 'package.json')),
  }
  prepareDevelopmentProject({
    projectDir: join(DEVELOPMENT_ROOT, 'project'),
    cliDir: join(REPOSITORY_ROOT, 'apps', 'cli'),
    hostDir: join(REPOSITORY_ROOT, 'apps', 'desktop-host'),
    dependencyDir: join(REPOSITORY_ROOT, 'node_modules', '.pnpm', 'node_modules'),
    release,
    target: resolveDesktopBuildTarget(),
  })
  await preparePrimaryRuntime()
  installBundle(electron)
  console.log(`studio app: installed ${BUNDLE}`)
  console.log(`studio app: data directory ${NINI_FLOW_HOME}`)
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
