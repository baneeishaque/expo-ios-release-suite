import { createPrivateKey, sign } from 'node:crypto';

/** Validate the caller's App Store Connect credentials without printing them. */
export function credentials(env = process.env) {
  for (const name of ['ASC_APP_ID', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY']) {
    if (!env[name]) throw new Error(`${name} is required for submission`);
  }
  if (!/^\d+$/.test(env.ASC_APP_ID) || !/^[A-Z0-9]+$/.test(env.ASC_KEY_ID)) throw new Error('Invalid Apple app/key ID');
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(env.ASC_ISSUER_ID)) {
    throw new Error('Invalid Apple issuer ID');
  }
  const key = createPrivateKey(env.ASC_KEY);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('Apple requires an EC P-256 key');
  }
  return { appId: env.ASC_APP_ID, keyId: env.ASC_KEY_ID, issuerId: env.ASC_ISSUER_ID, pem: env.ASC_KEY, key };
}

/** Verify agreement access and the exact destination bundle ID before a paid build. */
export async function verifyAppleApp(auth, bundleId) {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = `${b64({ alg: 'ES256', kid: auth.keyId, typ: 'JWT' })}.${b64({
    iss: auth.issuerId, iat: now, exp: now + 300, aud: 'appstoreconnect-v1',
  })}`;
  const signature = sign('sha256', Buffer.from(payload), { key: auth.key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const response = await fetch(`https://api.appstoreconnect.apple.com/v1/apps/${auth.appId}?fields%5Bapps%5D=bundleId`, {
    headers: { Authorization: `Bearer ${payload}.${signature}` }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(`Apple HTTP ${response.status}: ${result.errors?.[0]?.code || 'UNKNOWN'}`);
  }
  const { data } = await response.json();
  if (data?.type !== 'apps' || data.id !== auth.appId || data.attributes?.bundleId !== bundleId) {
    throw new Error('App Store Connect app does not match the expected bundle ID');
  }
}
