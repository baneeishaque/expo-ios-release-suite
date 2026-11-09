import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { render } from './render-workflow.mjs';

const actions = {};
for (const phase of ['simulator', 'eas']) {
  const text = fs.readFileSync(`${phase}/action.yml`, 'utf8');
  const doc = YAML.parseDocument(text, { uniqueKeys: true });
  assert.equal(doc.errors.length, 0, `${phase}: YAML parse errors`);
  const action = doc.toJS();
  assert.equal(action.runs.using, 'composite');
  assert.ok(action.name && action.description);
  for (const [name, input] of Object.entries(action.inputs)) {
    assert.ok(input.description, `Missing description: ${name}`);
    for (const key of Object.keys(input)) {
      assert.ok(['description', 'required', 'default', 'deprecationMessage'].includes(key), `Unsupported action input field: ${key}`);
    }
    if ('default' in input) assert.equal(typeof input.default, 'string', `${name}: composite defaults must be strings`);
  }
  for (const match of text.matchAll(/inputs\.([a-zA-Z0-9_-]+)/g)) assert.ok(action.inputs[match[1]], `Undeclared input ${match[1]}`);
  const ids = new Set();
  for (const step of action.runs.steps) {
    assert.ok(Boolean(step.run) !== Boolean(step.uses), 'A step must have exactly one run or uses');
    if (step.run) assert.ok(step.shell, 'Composite run steps need a shell');
    if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/, 'Action dependencies must be pinned');
    if (step.id) { assert.ok(!ids.has(step.id), 'Duplicate step ID'); ids.add(step.id); }
  }
  for (const match of text.matchAll(/steps\.([a-zA-Z0-9_-]+)\./g)) assert.ok(ids.has(match[1]), `Unknown step ${match[1]}`);
  actions[phase] = action;
}
const template = fs.readFileSync('templates/ios-build.yml.tmpl', 'utf8');
const workflow = YAML.parse(render(template, 'a'.repeat(40)));
assert.equal(workflow.jobs.device.needs, 'simulator');
assert.equal(workflow.jobs.device.if, "needs.simulator.outputs.eas == 'true'");
for (const [phase, job] of Object.entries(workflow.jobs)) {
  const step = job.steps.find(step => step.uses.includes('/expo-ios-release-suite/'));
  const contract = actions[phase === 'device' ? 'eas' : phase];
  for (const name of Object.keys(step.with)) assert.ok(contract.inputs[name], `Wrapper passes unsupported input ${name}`);
  for (const [name, input] of Object.entries(contract.inputs)) {
    if (input.required) assert.ok(name in step.with, `Wrapper omits required input ${name}`);
  }
}
console.log('Composite metadata and reusable workflow input contracts validated.');
