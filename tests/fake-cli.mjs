#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
if (command === 'timeout') process.exit(spawnSync(args[1], args.slice(2), { stdio: 'inherit', env: process.env }).status ?? 1);
if (command === 'curl') { fs.writeFileSync(args[args.indexOf('-o') + 1], 'fixture-ipa'); process.exit(0); }
if (command === 'unzip') process.exit(0);
if (command === 'xcodebuild') { console.log('Fixture compiler diagnostic'); process.exit(process.env.FIXTURE_SCENARIO === 'compile-failure' ? 65 : 0); }
if (command === 'xcbeautify') { fs.readFileSync(0, 'utf8'); process.exit(0); }
if (command === 'npx') {
  if (process.cwd() !== process.env.PROJECT_DIRECTORY) throw new Error('Wrong caller directory');
  console.log(JSON.stringify({ name: 'Fixture', ios: { bundleIdentifier: 'dev.example.fixture' } }));
  process.exit(0);
}
const file = process.env.FIXTURE_STATE;
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { enqueued: [], polls: {} };
const scenario = process.env.FIXTURE_SCENARIO;
if (args[0] === 'build') {
  const profile = args[args.indexOf('--profile') + 1];
  state.enqueued.push(profile);
  fs.writeFileSync(file, JSON.stringify(state));
  if (scenario === 'enqueue-failure') process.exit(1);
  console.log(JSON.stringify([{ id: profile, status: 'NEW' }]));
} else if (args[0] === 'build:view') {
  const id = args[1];
  state.polls[id] = (state.polls[id] || 0) + 1;
  fs.writeFileSync(file, JSON.stringify(state));
  if (scenario === 'poll-failure') process.exit(1);
  const status = scenario === 'errored' ? 'ERRORED' : scenario === 'canceled' ? 'CANCELED'
    : ['IN_QUEUE', 'IN_PROGRESS', 'FINISHED'][Math.min(state.polls[id] - 1, 2)];
  console.log(JSON.stringify({ id: scenario === 'wrong-id' ? 'wrong' : id, status,
    artifacts: { applicationArchiveUrl: 'https://example.invalid/app.ipa' }, appBuildVersion: '8', appVersion: '1.2.0' }));
} else throw new Error('Unexpected fixture command');
