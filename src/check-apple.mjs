import fs from 'node:fs';
import path from 'node:path';
import { credentials, verifyAppleApp } from './apple.mjs';

const identity = JSON.parse(fs.readFileSync(path.join(process.env.ARTIFACT_DIR, 'identity.json'), 'utf8'));
await verifyAppleApp(credentials(), identity.bundleId);
console.log('Apple app identity and agreement access verified.');
