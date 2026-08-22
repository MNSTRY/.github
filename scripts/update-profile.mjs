import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const START_MARKER = '<!-- mnstry:repositories:start -->'
export const END_MARKER = '<!-- mnstry:repositories:end -->'

const DEFAULT_CONFIG_PATH = 'profile/repositories.json'
const DEFAULT_README_PATH = 'profile/README.md'
const API_VERSION = '2022-11-28'

function assertSingleMarker(source, marker) {
  const first = source.indexOf(marker)
  const last = source.lastIndexOf(marker)
  if (first === -1 || first !== last) {
    throw new Error(`Expected exactly one ${marker} marker`)
  }
  return first
}

function escapeMarkdown(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/([\\`*_[\]])/g, '\\$1')
    .replace(/^([#+-])/, '\\$1')
}

function escapeCode(value) {
  return String(value).replaceAll('`', '\\`')
}

function titleCaseRepository(name) {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function validWebUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return null
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function semanticVersion(tag) {
  const match = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag ?? '')
  return match?.[1] ?? null
}

export function normalizeDescription(value) {
  if (!value) return 'No public description has been provided yet.'
  const normalized = String(value)
    .replace(/\s*[—–]\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, boundary, letter) => {
      return `${boundary}${letter.toUpperCase()}`
    })
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`
}

export function selectRepositories(repositories, config) {
  const excluded = new Set(config.exclude ?? [])
  const curated = config.repositories ?? {}

  return repositories
    .filter((repository) => {
      return (
        repository?.private === false &&
        repository?.fork !== true &&
        repository?.disabled !== true &&
        !excluded.has(repository.name)
      )
    })
    .sort((left, right) => {
      const leftOrder = curated[left.name]?.order ?? Number.MAX_SAFE_INTEGER
      const rightOrder = curated[right.name]?.order ?? Number.MAX_SAFE_INTEGER
      if (leftOrder !== rightOrder) return leftOrder - rightOrder

      const activity = String(right.pushed_at ?? '').localeCompare(
        String(left.pushed_at ?? ''),
      )
      return activity || left.name.localeCompare(right.name)
    })
}

function renderRepository(repository, config) {
  const curated = config.repositories?.[repository.name] ?? {}
  const displayName = escapeMarkdown(
    curated.displayName ?? titleCaseRepository(repository.name),
  )
  const description = escapeMarkdown(normalizeDescription(repository.description))
  const metadata = []

  if (repository.archived) metadata.push('Archived')
  if (repository.language) metadata.push(escapeCode(repository.language))
  if (repository.license?.spdx_id) {
    metadata.push(escapeCode(repository.license.spdx_id))
  }
  if (repository.latestVersion?.tag) {
    const tag = escapeMarkdown(repository.latestVersion.tag)
    metadata.push(`[${tag}](${repository.latestVersion.url})`)
  }
  const pushedAt = formatDate(repository.pushed_at)
  if (pushedAt) metadata.push(`Updated ${pushedAt}`)

  const links = [`[Repository](${repository.html_url})`]
  const documentationUrl = validWebUrl(curated.documentationUrl)
  if (documentationUrl) links.push(`[Documentation](${documentationUrl})`)

  const homepage = validWebUrl(repository.homepage)
  if (
    curated.includeHomepage !== false &&
    homepage &&
    homepage !== documentationUrl
  ) {
    links.push(`[Project site](${homepage})`)
  }
  if (repository.has_issues) links.push(`[Issues](${repository.html_url}/issues)`)

  const topics = [
    ...new Set(curated.topics ?? [...(repository.topics ?? [])].sort()),
  ]
    .map((topic) => `\`${escapeCode(topic)}\``)
    .join(' ')

  const version = semanticVersion(repository.latestVersion?.tag)
  const install =
    curated.packageName && version
      ? [
          '',
          '```sh',
          `npm install --save-dev ${curated.packageName}@${version}`,
          '```',
        ]
      : []

  return [
    `### [${displayName}](${repository.html_url})`,
    '',
    description,
    '',
    metadata.join(' · '),
    '',
    links.join(' · '),
    ...(topics ? ['', topics] : []),
    ...install,
  ].join('\n')
}

export function renderRepositorySection(repositories, config) {
  const selected = selectRepositories(repositories, config)
  if (selected.length === 0) {
    return '_No public MNSTRY product repositories are currently listed._'
  }
  return selected
    .map((repository) => renderRepository(repository, config))
    .join('\n\n---\n\n')
}

export function replaceGeneratedSection(source, generated) {
  const start = assertSingleMarker(source, START_MARKER)
  const end = assertSingleMarker(source, END_MARKER)
  if (end <= start) throw new Error('Repository markers are out of order')

  const before = source.slice(0, start + START_MARKER.length)
  const after = source.slice(end)
  return `${before}\n${generated.trim()}\n${after}`
}

async function githubJson(url, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mnstry-profile-updater',
    'X-GitHub-Api-Version': API_VERSION,
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${url}`)
  }
  return response.json()
}

async function latestVersion(repository, token) {
  const releases = await githubJson(
    `${repository.url}/releases?per_page=1`,
    token,
  )
  if (releases[0]?.tag_name) {
    return {
      tag: releases[0].tag_name,
      url: releases[0].html_url,
    }
  }

  const tags = await githubJson(`${repository.url}/tags?per_page=1`, token)
  if (!tags[0]?.name) return null
  return {
    tag: tags[0].name,
    url: `${repository.html_url}/tree/${encodeURIComponent(tags[0].name)}`,
  }
}

export async function fetchPublicRepositories(organization, token) {
  const repositories = []
  let page = 1

  while (true) {
    const batch = await githubJson(
      `https://api.github.com/orgs/${encodeURIComponent(organization)}/repos?type=public&sort=updated&direction=desc&per_page=100&page=${page}`,
      token,
    )
    repositories.push(...batch)
    if (batch.length < 100) break
    page += 1
  }

  return Promise.all(
    repositories.map(async (repository) => ({
      ...repository,
      latestVersion: await latestVersion(repository, token),
    })),
  )
}

function parseArgs(argv) {
  const options = {
    check: false,
    configPath: DEFAULT_CONFIG_PATH,
    inputPath: null,
    readmePath: DEFAULT_README_PATH,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') options.check = true
    else if (argument === '--config') options.configPath = argv[++index]
    else if (argument === '--input') options.inputPath = argv[++index]
    else if (argument === '--readme') options.readmePath = argv[++index]
    else throw new Error(`Unknown argument: ${argument}`)
  }

  if (!options.configPath || !options.readmePath) {
    throw new Error('Missing value for --config or --readme')
  }
  return options
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const configPath = resolve(options.configPath)
  const readmePath = resolve(options.readmePath)
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  const repositories = options.inputPath
    ? JSON.parse(await readFile(resolve(options.inputPath), 'utf8'))
    : await fetchPublicRepositories(config.organization, process.env.GITHUB_TOKEN)

  const source = await readFile(readmePath, 'utf8')
  const generated = renderRepositorySection(repositories, config)
  const next = replaceGeneratedSection(source, generated)

  if (options.check) {
    if (next !== source) {
      throw new Error('profile/README.md is out of date. Run npm run profile:update.')
    }
    process.stdout.write('profile/README.md is current.\n')
    return
  }

  if (next === source) {
    process.stdout.write('profile/README.md is unchanged.\n')
    return
  }
  await writeFile(readmePath, next)
  process.stdout.write('Updated profile/README.md.\n')
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
