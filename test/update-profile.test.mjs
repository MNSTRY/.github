import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  END_MARKER,
  START_MARKER,
  normalizeDescription,
  renderRepositorySection,
  replaceGeneratedSection,
  selectRepositories,
} from '../scripts/update-profile.mjs'

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/public-repositories.json', import.meta.url)),
)
const config = {
  organization: 'MNSTRY',
  exclude: ['.github'],
  repositories: {
    atelier: {
      displayName: 'MNSTRY Atelier',
      documentationUrl:
        'https://docs.mnstry.ai/public-product/developers/atelier',
      includeHomepage: false,
      packageName: '@mnstry/atelier',
      order: 10,
      topics: [
        'local-first',
        'knowledge-graph',
        'governance',
        'ontology',
        'authoring',
        'validation',
      ],
    },
  },
}

test('selects only public MNSTRY source repositories', () => {
  const selected = selectRepositories(fixture, config)
  assert.deepEqual(
    selected.map((repository) => repository.name),
    ['atelier', 'field-notes'],
  )
})

test('renders live metadata, explicit status, and a pinned package install', () => {
  const section = renderRepositorySection(fixture, config)
  assert.match(section, /### \[MNSTRY Atelier\]/)
  assert.match(section, /file-based bodies of work\. Front-matter ontology/)
  assert.match(section, /Apache-2\.0/)
  assert.match(section, /v0\.2\.0-alpha\.4/)
  assert.doesNotMatch(section, /Project site/)
  assert.match(
    section,
    /npm install --save-dev @mnstry\/atelier@0\.2\.0-alpha\.4/,
  )
  assert.match(section, /### \[Field Notes\]/)
  assert.match(section, /Archived/)
  assert.doesNotMatch(section, /upstream-fork|Organization profile infrastructure/)
})

test('replaces only the generated repository block', () => {
  const source = `before\n${START_MARKER}\nstale\n${END_MARKER}\nafter\n`
  const next = replaceGeneratedSection(source, 'fresh')
  assert.equal(next, `before\n${START_MARKER}\nfresh\n${END_MARKER}\nafter\n`)
})

test('fails closed when markers are missing or duplicated', () => {
  assert.throws(() => replaceGeneratedSection('no markers', 'fresh'))
  assert.throws(() =>
    replaceGeneratedSection(
      `${START_MARKER}\n${START_MARKER}\n${END_MARKER}`,
      'fresh',
    ),
  )
})

test('normalizes long dashes out of public descriptions', () => {
  assert.equal(normalizeDescription('One — two – three'), 'One. Two. Three.')
})
