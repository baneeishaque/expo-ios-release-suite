import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { publicEnvironment, writeJson } from './common.mjs';

/** Match the resolved Expo identity against caller-supplied release expectations. */
export function verifyIdentity(config, expected = {}) {
  const expo = config.expo || config;
  const identity = { bundleId: expo.ios?.bundleIdentifier, projectId: expo.extra?.eas?.projectId,
    owner: expo.owner, slug: expo.slug, name: expo.name, version: expo.version };
  for (const [name, value] of Object.entries(expected)) {
    if (value && identity[name] !== value) throw new Error(`Unexpected Expo ${name}`);
  }
  if (!identity.bundleId) throw new Error('The app must define ios.bundleIdentifier');
  return identity;
}

/** Resolve static or dynamic Expo config using the caller's locked Expo CLI. */
export function inspectProject() {
  const config = JSON.parse(execFileSync('npx', ['--no-install', 'expo', 'config', '--type', 'public', '--json'], {
    cwd: process.env.PROJECT_DIRECTORY, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...publicEnvironment(process.env.PUBLIC_ENV) },
    stdio: ['ignore', 'pipe', 'inherit'],
  }));
  const identity = verifyIdentity(config, { bundleId: process.env.EXPECTED_BUNDLE_ID,
    projectId: process.env.EXPECTED_PROJECT_ID, owner: process.env.EXPECTED_OWNER });
  writeJson(path.join(process.env.ARTIFACT_DIR, 'identity.json'), identity);
  console.log(`Verified app identity: ${identity.bundleId}`);
  return identity;
}
