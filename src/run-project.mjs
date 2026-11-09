import { spawnSync } from 'node:child_process';
import { publicEnvironment } from './common.mjs';

const [command, ...args] = process.argv.slice(2);
if (!command || !process.env.PROJECT_DIRECTORY) throw new Error('Project directory and command are required');
const child = spawnSync(command, args, {
  cwd: process.env.PROJECT_DIRECTORY, stdio: 'inherit',
  env: { ...process.env, ...publicEnvironment(process.env.PUBLIC_ENV) },
});
if (child.error) throw child.error;
process.exit(child.status ?? 1);
