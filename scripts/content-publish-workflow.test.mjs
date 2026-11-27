import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import yaml from 'js-yaml'

const workflow = (name) =>
  yaml.load(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'))

test('JSON-only edits publish independently and the full deploy preserves the content paths', () => {
  const content = workflow('publish-content')
  const web = workflow('deploy-production')
  const qa = workflow('deploy')
  const store = workflow('ios-testflight')
  assert.deepEqual(Object.keys(store.on), ['workflow_dispatch'])
  for (const path of ['public/config/**', 'content/**']) {
    assert.ok(content.on.push.paths.includes(path))
    assert.ok(content.on.pull_request.paths.includes(path))
    assert.ok(web.on.push['paths-ignore'].includes(path))
  }
  assert.ok(qa.on.push.paths.includes('!public/config/**'))
  const publish = content.jobs.publish
  assert.equal(publish.needs, 'validate')
  assert.equal(publish.if, "github.ref == 'refs/heads/main' && github.event_name != 'pull_request'")
  assert.deepEqual(publish.concurrency, web.concurrency)
  assert.deepEqual(publish.concurrency, qa.concurrency)
  const steps = publish.steps.map(({ run }) => run ?? '').join('\n')
  assert.ok(steps.includes('node scripts/prepare-game-content.mjs'))
  assert.match(steps, /git -C deployment add -- config\/ content\//)
  assert.doesNotMatch(steps, /npm run build|db push|gradlew|xcodebuild|--delete/)
  const fullDeploy = web.jobs['deploy-production'].steps.find(({ run }) => run?.startsWith('rsync'))
  assert.match(fullDeploy.run, /--exclude '\/config\/' --exclude '\/content\/'/)
})
