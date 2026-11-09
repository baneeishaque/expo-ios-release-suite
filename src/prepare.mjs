import fs from 'node:fs';
import path from 'node:path';
import { boolean, integer, output, projectDirectory, publicEnvironment } from './common.mjs';
import { plan, selectedProfiles } from './policy.mjs';

const phase = process.argv[2];
const { project, relative } = projectDirectory(process.env.APP_DIRECTORY || '.');
publicEnvironment(process.env.PUBLIC_ENV);
const prefix = process.env.ARTIFACT_PREFIX || 'ios';
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(prefix)) throw new Error('Invalid artifact-prefix');
integer(process.env.RETENTION_DAYS || '14', 'retention-days', 1, 90);
if (!process.env.RUNNER_TEMP) throw new Error('RUNNER_TEMP is required');
let policy;
if (phase === 'simulator') {
  policy = plan({ event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF,
    target: process.env.TARGET || 'simulator', profile: process.env.PROFILE,
    submit: process.env.SUBMIT, releaseBranch: process.env.RELEASE_BRANCH ?? 'main' });
  if (!/^\d+\.\d+(\.\d+)?$/.test(process.env.XCODE_VERSION || '')) throw new Error('Use an explicit Xcode version');
  boolean(process.env.PREBUILD, 'prebuild', true);
  for (const [name, value] of Object.entries(policy)) output(name, value);
} else if (phase === 'eas') {
  if (process.env.SIMULATOR_RESULT !== 'success') throw new Error('A successful simulator result is required before EAS');
  const profiles = selectedProfiles(process.env.PROFILE);
  const submit = boolean(process.env.SUBMIT, 'submit');
  if (submit && !profiles.includes('production')) throw new Error('submit=true requires production or both');
  for (const name of ['EXPO_TOKEN', 'EXPECTED_BUNDLE_ID', 'EXPECTED_PROJECT_ID']) {
    if (!process.env[name]) throw new Error(`${name} is required for EAS`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(process.env.EAS_VERSION || '')) throw new Error('Use an explicit EAS CLI version');
  for (const name of ['DEVICE_PROFILE', 'PRODUCTION_PROFILE']) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(process.env[name] || '')) throw new Error(`Invalid ${name}`);
  }
  output('wait-seconds', integer(process.env.WAIT_SECONDS || '9000', 'wait-seconds', 1, 18000));
  output('poll-seconds', integer(process.env.POLL_SECONDS || '60', 'poll-seconds', 1, 300));
  output('profiles', profiles.join(','));
  output('submit', submit);
} else throw new Error('Invalid action phase');

const artifacts = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'expo-ios-'));
output('project-directory', project);
output('relative-directory', relative.replaceAll(path.sep, '/'));
output('artifact-directory', artifacts);
output('artifact-name', `${prefix}-${phase}-${process.env.GITHUB_SHA || 'local'}`);
if (policy) console.log(`Simulator compilation required; EAS=${policy.eas}; profile=${policy.profile || 'none'}; package=${policy.package}`);
