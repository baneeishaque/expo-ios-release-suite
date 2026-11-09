import { boolean } from './common.mjs';

/** Resolve the release policy using the caller's event and explicit manual inputs. */
export function plan({ event, ref, target = 'simulator', profile = '', submit = false, releaseBranch = 'main' }) {
  const result = { eas: false, profile: '', submit: false, package: true };
  if (!event) throw new Error('GitHub event is required');
  if (event === 'push' && releaseBranch && ref === `refs/heads/${releaseBranch}`) {
    return { ...result, eas: true, profile: 'production', submit: true };
  }
  if (event !== 'workflow_dispatch') return result;
  if (!['simulator', 'device', 'both'].includes(target)) throw new Error('Invalid target');
  if (target === 'simulator') return result;
  const profiles = selectedProfiles(profile);
  const shouldSubmit = boolean(submit, 'submit');
  if (shouldSubmit && !profiles.includes('production')) throw new Error('submit=true requires production or both');
  return { eas: true, profile, submit: shouldSubmit, package: target !== 'device' };
}

/** Expand a required profile choice; no implicit paid build default is permitted. */
export function selectedProfiles(profile) {
  if (profile === 'both') return ['device', 'production'];
  if (profile === 'device' || profile === 'production') return [profile];
  throw new Error('Select profile=device, production, or both');
}
