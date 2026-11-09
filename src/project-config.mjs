import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publicEnvironment, writeJson } from './common.mjs';
import { selectedProfiles } from './policy.mjs';
import { credentials } from './apple.mjs';

const operation = process.argv[2];
const configPath = path.join(process.env.PROJECT_DIRECTORY, 'eas.json');
const privateDir = path.join(process.env.ARTIFACT_DIR, 'private');
const statePath = path.join(privateDir, 'config-state.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

if (operation === 'restore') {
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (hash(fs.readFileSync(configPath)) !== state.expectedHash) {
      throw new Error('eas.json changed after suite configuration; preserving current contents');
    }
    fs.writeFileSync(configPath, Buffer.from(state.original, 'base64'));
    console.log('Original eas.json restored.');
  }
} else {
  const before = fs.readFileSync(configPath);
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : { original: before.toString('base64'), expectedHash: hash(before) };
  if (hash(before) !== state.expectedHash) throw new Error('Unexpected concurrent eas.json change');
  const config = JSON.parse(before);
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  if (operation === 'build') {
    const env = publicEnvironment(process.env.PUBLIC_ENV);
    const effective = (name, seen = new Set()) => {
      if (seen.has(name)) throw new Error('Circular EAS profile inheritance');
      seen.add(name);
      const profile = config.build?.[name];
      if (!Object.hasOwn(config.build || {}, name) || !profile || typeof profile !== 'object' || Array.isArray(profile)) {
        throw new Error(`Missing or invalid EAS build profile: ${name}`);
      }
      const parent = profile.extends ? effective(profile.extends, seen) : {};
      return { ...parent, ...profile, ios: { ...parent.ios, ...profile.ios } };
    };
    for (const logical of selectedProfiles(process.env.PROFILE)) {
      const name = logical === 'device' ? process.env.DEVICE_PROFILE : process.env.PRODUCTION_PROFILE;
      if (!name || !Object.hasOwn(config.build || {}, name)) throw new Error(`Missing EAS build profile: ${name || logical}`);
      const resolved = effective(name);
      if (resolved.ios?.simulator === true) throw new Error('EAS device profiles cannot build simulator archives');
      if (process.env.SUBMIT === 'true' && logical === 'production' &&
          ((resolved.distribution || 'store') !== 'store' || resolved.developmentClient === true)) {
        throw new Error('Submission requires a store-distribution production profile');
      }
      if (Object.keys(env).length) config.build[name].env = { ...config.build[name].env, ...env };
    }
  } else if (operation === 'submit') {
    const auth = credentials();
    const keyPath = path.join(privateDir, 'asc-api-key.p8');
    fs.writeFileSync(keyPath, auth.pem, { mode: 0o600 });
    config.submit ??= {};
    config.submit['expo-ios-release-suite'] = { ios: {
      ascAppId: auth.appId, ascApiKeyId: auth.keyId, ascApiKeyIssuerId: auth.issuerId, ascApiKeyPath: keyPath,
    } };
  } else throw new Error('Unknown configuration operation');
  const next = `${JSON.stringify(config, null, 2)}\n`;
  // Persist recovery data before modifying the caller's temporary checkout.
  state.expectedHash = hash(next);
  writeJson(statePath, state);
  fs.writeFileSync(configPath, next);
  console.log(`Prepared EAS ${operation} configuration.`);
}
