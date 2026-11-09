import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { plan } from '../src/policy.mjs';
import { publicEnvironment, projectDirectory } from '../src/common.mjs';
import { verifyIdentity } from '../src/identity.mjs';
import { credentials, verifyAppleApp } from '../src/apple.mjs';
import { render } from '../scripts/render-workflow.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.TEST_ARTIFACT_DIR;
assert.ok(base && path.resolve(base).startsWith(`${root}scratch/`), 'Set TEST_ARTIFACT_DIR inside this checkout/scratch');
fs.mkdirSync(base, { recursive: true });
function workspace() {
  const directory = fs.mkdtempSync(path.join(base, 'case-'));
  const project = path.join(directory, 'caller app');
  const artifacts = path.join(directory, 'artifacts');
  fs.mkdirSync(project);
  fs.mkdirSync(artifacts);
  const env = { ...process.env, PROJECT_DIRECTORY: project, ARTIFACT_DIR: artifacts,
    GITHUB_WORKSPACE: project, RUNNER_TEMP: directory, GITHUB_OUTPUT: path.join(directory, 'outputs'),
    GITHUB_STEP_SUMMARY: path.join(directory, 'summary.md'), PUBLIC_ENV: '{}',
    DEVICE_PROFILE: 'internal', PRODUCTION_PROFILE: 'store', PROFILE: 'both',
    PROFILES: 'device,production', WAIT_SECONDS: '30', POLL_SECONDS: '0' };
  fs.writeFileSync(path.join(project, 'eas.json'), JSON.stringify({ build: { internal: {}, store: {} }, submit: { existing: {} } }));
  return { directory, project, artifacts, env };
}
function command(file, args, context) {
  const runner = file.endsWith('.bash') ? 'bash' : process.execPath;
  return spawnSync(runner, [path.join(root, 'src', file), ...args], {
    cwd: context.project, env: context.env, encoding: 'utf8', timeout: 15000,
  });
}
function fakeTools(context) {
  const bin = path.join(context.directory, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['eas', 'timeout', 'curl', 'unzip', 'xcodebuild', 'xcbeautify', 'npx']) {
    fs.symlinkSync(path.join(root, 'tests/fake-cli.mjs'), path.join(bin, name));
  }
  context.env.PATH = `${bin}:${process.env.PATH}`;
  context.env.FIXTURE_STATE = path.join(context.directory, 'state.json');
}

test('main pushes force production and submission', () => {
  assert.deepEqual(plan({ event: 'push', ref: 'refs/heads/main' }), { eas: true, profile: 'production', submit: true, package: true });
});
for (const [event, ref] of [['push', 'refs/heads/feature/ios'], ['push', 'refs/tags/v1'], ['pull_request', 'refs/pull/1/merge'], ['merge_group', 'refs/heads/main']]) {
  test(`${event} ${ref} never requests EAS`, () => assert.equal(plan({ event, ref }).eas, false));
}
test('empty release branch disables automatic paid builds', () => {
  assert.equal(plan({ event: 'push', ref: 'refs/heads/main', releaseBranch: '' }).eas, false);
});
for (const target of ['simulator', 'device', 'both']) {
  for (const profile of ['', 'device', 'production', 'both']) {
    for (const submit of [false, true]) {
      test(`manual ${target}/${profile || 'missing'}/${submit}`, () => {
        const call = () => plan({ event: 'workflow_dispatch', target, profile, submit });
        if (target !== 'simulator' && (!profile || (profile === 'device' && submit))) assert.throws(call);
        else {
          const result = call();
          assert.equal(result.eas, target !== 'simulator');
          assert.equal(result.package, target !== 'device');
          assert.equal(result.submit, target === 'simulator' ? false : submit);
        }
      });
    }
  }
}
test('invalid string booleans do not silently enable submission', () => {
  assert.throws(() => plan({ event: 'workflow_dispatch', target: 'device', profile: 'production', submit: 'yes' }));
});
test('public env cannot smuggle private credentials or non-string data', () => {
  assert.throws(() => publicEnvironment('{"ASC_KEY":"secret"}'));
  assert.throws(() => publicEnvironment('{"EXPO_PUBLIC_FLAG":true}'));
  assert.throws(() => publicEnvironment('[]'));
  assert.deepEqual(publicEnvironment('{"EXPO_PUBLIC_LABEL":"quoted \\"text\\""}'), { EXPO_PUBLIC_LABEL: 'quoted "text"' });
});
test('identity expectations are caller-specific and fail on another app', () => {
  const config = { ios: { bundleIdentifier: 'dev.example.one' }, extra: { eas: { projectId: 'one' } } };
  assert.equal(verifyIdentity(config, { bundleId: 'dev.example.one' }).projectId, 'one');
  assert.throws(() => verifyIdentity(config, { bundleId: 'dev.example.two' }));
  assert.throws(() => verifyIdentity(config, { projectId: 'two' }));
});
test('working directory may not escape the checkout', () => {
  const before = process.env.GITHUB_WORKSPACE;
  process.env.GITHUB_WORKSPACE = root;
  try { assert.throws(() => projectDirectory('../')); } finally {
    if (before === undefined) delete process.env.GITHUB_WORKSPACE; else process.env.GITHUB_WORKSPACE = before;
  }
});
test('reusable workflow rendering requires a full immutable implementation SHA', () => {
  assert.throws(() => render('__ACTION_REF__', 'main'));
  assert.equal(render('__ACTION_REF__ __ACTION_REF__', 'a'.repeat(40)), `${'a'.repeat(40)} ${'a'.repeat(40)}`);
});

test('EAS preparation rejects a skipped simulator', () => {
  const context = workspace();
  context.env.SIMULATOR_RESULT = 'skipped';
  const result = command('prepare.mjs', ['eas'], context);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /successful simulator/);
});
test('Expo config is resolved from the caller project, not the action directory', () => {
  const context = workspace();
  fakeTools(context);
  context.env.EXPECTED_BUNDLE_ID = 'dev.example.fixture';
  const result = command('inspect-project.mjs', [], context);
  assert.equal(result.status, 0, result.stderr);
  const identity = JSON.parse(fs.readFileSync(path.join(context.artifacts, 'identity.json')));
  assert.equal(identity.bundleId, 'dev.example.fixture');
});
test('compiler failure survives the formatter and raw diagnostics are retained', () => {
  const context = workspace();
  fakeTools(context);
  Object.assign(context.env, { FIXTURE_SCENARIO: 'compile-failure', XCODE_FLAG: '-workspace',
    XCODE_CONTAINER: 'ios/App.xcworkspace', XCODE_SCHEME: 'App' });
  const result = command('simulator.bash', ['build'], context);
  assert.equal(result.status, 65);
  assert.match(fs.readFileSync(path.join(context.artifacts, 'xcodebuild.log'), 'utf8'), /compiler diagnostic/);
});
test('both logical profiles map to caller EAS names and preserve separate artifacts', () => {
  const context = workspace();
  fakeTools(context);
  const result = command('eas.bash', ['build'], context);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(context.env.FIXTURE_STATE)).enqueued, ['internal', 'store']);
  assert.ok(fs.existsSync(path.join(context.artifacts, 'app-device.ipa')));
  assert.ok(fs.existsSync(path.join(context.artifacts, 'app-production.ipa')));
  assert.match(fs.readFileSync(context.env.GITHUB_OUTPUT, 'utf8'), /production-build-number=8/);
});
for (const scenario of ['errored', 'canceled', 'poll-failure', 'wrong-id', 'enqueue-failure']) {
  test(`EAS ${scenario} does not requeue or start the next profile`, () => {
    const context = workspace();
    fakeTools(context);
    context.env.FIXTURE_SCENARIO = scenario;
    assert.notEqual(command('eas.bash', ['build'], context).status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(context.env.FIXTURE_STATE)).enqueued, ['internal']);
  });
}
test('missing production IPA fails submission', () => {
  assert.notEqual(command('eas.bash', ['submit'], workspace()).status, 0);
});

test('temporary public environment merging is restored byte-for-byte', () => {
  const context = workspace();
  const file = path.join(context.project, 'eas.json');
  const original = fs.readFileSync(file);
  context.env.PUBLIC_ENV = '{"EXPO_PUBLIC_VALUE":"test"}';
  assert.equal(command('project-config.mjs', ['build'], context).status, 0);
  const config = JSON.parse(fs.readFileSync(file));
  assert.equal(config.build.store.env.EXPO_PUBLIC_VALUE, 'test');
  assert.ok(config.submit.existing);
  assert.equal(command('project-config.mjs', ['restore'], context).status, 0);
  assert.deepEqual(fs.readFileSync(file), original);
});
test('restore preserves unexpected newer caller configuration', () => {
  const context = workspace();
  assert.equal(command('project-config.mjs', ['build'], context).status, 0);
  const file = path.join(context.project, 'eas.json');
  fs.writeFileSync(file, '{"newer":"keep"}');
  assert.notEqual(command('project-config.mjs', ['restore'], context).status, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"newer":"keep"}');
});
test('a production alias inheriting internal distribution is rejected before building', () => {
  const context = workspace();
  context.env.PROFILE = 'production';
  context.env.SUBMIT = 'true';
  const file = path.join(context.project, 'eas.json');
  const original = JSON.stringify({ build: { internal: { distribution: 'internal' }, store: { extends: 'internal' } } });
  fs.writeFileSync(file, original);
  const result = command('project-config.mjs', ['build'], context);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /store-distribution/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});
test('circular EAS profile inheritance is rejected', () => {
  const context = workspace();
  fs.writeFileSync(path.join(context.project, 'eas.json'), JSON.stringify({ build: {
    internal: { extends: 'store' }, store: { extends: 'internal' },
  } }));
  assert.notEqual(command('project-config.mjs', ['build'], context).status, 0);
});
const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const appleEnv = { ASC_APP_ID: '12345', ASC_KEY_ID: 'EXAMPLEKEY',
  ASC_ISSUER_ID: '00000000-0000-4000-8000-000000000001', ASC_KEY: pem };
test('private signing material is outside caller source and not world-readable', () => {
  const context = workspace();
  Object.assign(context.env, appleEnv);
  assert.equal(command('project-config.mjs', ['submit'], context).status, 0);
  const keyPath = JSON.parse(fs.readFileSync(path.join(context.project, 'eas.json'))).submit['expo-ios-release-suite'].ios.ascApiKeyPath;
  assert.ok(keyPath.startsWith(context.artifacts));
  assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
});
for (const scenario of ['valid', 'agreement', 'wrong-bundle']) {
  test(`Apple preflight: ${scenario}`, async () => {
    const saved = globalThis.fetch;
    globalThis.fetch = async (_url, options) => {
      assert.ok(options.signal);
      if (scenario === 'agreement') return new Response(JSON.stringify({ errors: [{ code: 'FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED' }] }), { status: 403 });
      return new Response(JSON.stringify({ data: { id: '12345', type: 'apps', attributes: {
        bundleId: scenario === 'wrong-bundle' ? 'dev.example.other' : 'dev.example.fixture',
      } } }));
    };
    try {
      const operation = verifyAppleApp(credentials(appleEnv), 'dev.example.fixture');
      if (scenario === 'valid') await operation; else await assert.rejects(operation);
    } finally { globalThis.fetch = saved; }
  });
}
