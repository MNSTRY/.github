import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { renderBrandBanner } from '../scripts/render-brand-banner.mjs'

test('assets/mnstry-open-source.svg matches canonical-references.json (M08 + W36 + violet dusk)', async () => {
  const refs = JSON.parse(
    await readFile(new URL('../canonical-references.json', import.meta.url), 'utf8'),
  )
  const svg = await readFile(
    new URL('../assets/mnstry-open-source.svg', import.meta.url),
    'utf8',
  )
  assert.equal(refs.authorities.designSystem.adoptedDrawings.mark, 'M08')
  assert.equal(refs.authorities.designSystem.adoptedDrawings.wordmark, 'W36')
  assert.equal(svg, renderBrandBanner(refs))
  assert.match(svg, /#251C3A/)
  assert.match(svg, /#F0D595/)
  assert.match(svg, /#DDC9FE/)
})
