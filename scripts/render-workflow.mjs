import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Bind the workflow to an immutable, already-existing implementation commit. */
export function render(template, ref) {
  if (!/^[a-f0-9]{40}$/.test(ref)) throw new Error('Provide a full action implementation commit SHA');
  if (!template.includes('__ACTION_REF__')) throw new Error('Template lacks action references');
  return template.replaceAll('__ACTION_REF__', ref);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const fixture = process.argv[2] === '--lint-fixture';
  const ref = fixture ? 'a'.repeat(40) : process.argv[2];
  const text = render(fs.readFileSync(path.join(root, 'templates/ios-build.yml.tmpl'), 'utf8'), ref);
  if (!fixture) {
    execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], { cwd: root });
    execFileSync('git', ['diff', '--exit-code', ref, '--', 'src', 'simulator', 'eas'], { cwd: root });
  }
  const output = fixture ? path.resolve(process.argv[3]) : path.join(root, '.github/workflows/ios-build.yml');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, text);
  console.log(`Reusable workflow pinned to ${ref}`);
}
