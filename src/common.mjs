import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/** Parse Actions string booleans without treating "false" as truthy. */
export function boolean(value, name, fallback = false) {
  if (value === undefined || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

/** Validate numeric limits before using them in shell arithmetic or timeouts. */
export function integer(value, name, min, max) {
  if (!/^\d+$/.test(String(value))) throw new Error(`${name} must be an integer`);
  const result = Number(value);
  if (result < min || result > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return result;
}

/** Export step data using a collision-resistant delimiter for multiline values. */
export function output(name, value) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Invalid output name');
  const delimiter = `value_${randomBytes(16).toString('hex')}`;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

/** Resolve the caller project, not the action repository or another checkout. */
export function projectDirectory(input = '.') {
  const workspace = fs.realpathSync(process.env.GITHUB_WORKSPACE || process.cwd());
  const project = fs.realpathSync(path.resolve(workspace, input));
  const relative = path.relative(workspace, project);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('working-directory must be inside GITHUB_WORKSPACE');
  }
  if (!fs.statSync(project).isDirectory()) throw new Error('working-directory must be a directory');
  return { project, relative: relative || '.' };
}

/** Only explicitly public Expo configuration may be forwarded into app builds. */
export function publicEnvironment(text = '{}') {
  const value = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('public-env must be a JSON object');
  for (const [name, content] of Object.entries(value)) {
    if (!/^EXPO_PUBLIC_[A-Z0-9_]+$/.test(name) || typeof content !== 'string') {
      throw new Error('public-env must map EXPO_PUBLIC_* names to strings');
    }
  }
  return value;
}

export function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
