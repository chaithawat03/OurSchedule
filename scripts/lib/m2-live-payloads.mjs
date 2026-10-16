// Pure helpers for staging-only live Rules test. No credentials or network here.
export const PROJECT = 'ourschedule';
export const APP_PREFIX = '1:400176852634:web:';
export const DOC_ROOT = 'projects/ourschedule/databases/(default)/documents';
export const DOC_API = 'https://firestore.googleapis.com/v1/' + DOC_ROOT;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const UID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;

export function parseInviteInput(value) {
  const raw = (value || '').trim();
  let token = raw;
  if (raw.startsWith('https://')) {
    const url = new URL(raw);
    if (url.origin !== 'https://ourschedule.web.app' || url.pathname !== '/') {
      throw new Error('Invite must belong to staging ourschedule.web.app');
    }
    token = new URLSearchParams(url.hash.slice(1)).get('invite') || '';
  }
  if (!TOKEN_PATTERN.test(token)) throw new Error('Invalid 43-character invite token');
  return token;
}

export function validateStaging(config) {
  if (config.VITE_FIREBASE_PROJECT_ID !== PROJECT ||
      !config.VITE_FIREBASE_APP_ID?.startsWith(APP_PREFIX) ||
      !config.VITE_FIREBASE_API_KEY ||
      config.VITE_FIREBASE_AUTH_DOMAIN !== 'ourschedule.firebaseapp.com') {
    throw new Error('Wrong Firebase Web App configuration: Staging-only check');
  }
  if (config.VITE_RECAPTCHA_V3_SITE_KEY) {
    throw new Error('App Check site key is configured: direct REST test needs separate attestation plan');
  }
}

export function pathOf(...parts) {
  if (!parts.every((p) => /^[A-Za-z0-9_-]{1,128}$/.test(p))) {
    throw new Error('Unexpected document path segment');
  }
  return DOC_ROOT + '/' + parts.join('/');
}

const value = (v) => ({ stringValue: v });
const serverNow = (fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' });

export function claimWrites(token, roomId, uid) {
  const inviteName = pathOf('roomInvites', token);
  const memberName = pathOf('rooms', roomId, 'members', uid);
  return [
    {
      update: {
        name: inviteName,
        fields: {
          state: value('accepted'),
          acceptedByUid: value(uid),
        },
      },
      updateMask: { fieldPaths: ['state', 'acceptedByUid'] },
      updateTransforms: [serverNow('acceptedAt')],
      currentDocument: { exists: true },
    },
    {
      update: {
        name: memberName,
        fields: {
          uid: value(uid),
          role: value('member'),
          membershipState: value('active'),
          inviteId: value(token),
        },
      },
      updateTransforms: [serverNow('joinedAt')],
      currentDocument: { exists: false },
    },
  ];
}

export function safeDeniedUpdate(name, fields) {
  // precondition cannot hold against an EXISTING A document, so an
  // unexpected authorization grant cannot silently corrupt A's data.
  return {
    update: { name, fields },
    updateMask: { fieldPaths: Object.keys(fields) },
    currentDocument: { exists: false },
  };
}

export function safeDeniedCreate(name, fields) {
  // precondition cannot hold against a NONEXISTENT target, so even
  // if Rules are misconfigured it cannot create an unauthorized doc.
  return {
    update: { name, fields },
    currentDocument: { exists: true },
  };
}

const fieldEquals = (fieldPath, text) => ({
  fieldFilter: {
    field: { fieldPath },
    op: 'EQUAL',
    value: { stringValue: text },
  },
});

export function joinedRoomsQuery(uid) {
  if (!UID_PATTERN.test(uid)) throw new Error('Invalid UID');
  return {
    structuredQuery: {
      from: [{ collectionId: 'members', allDescendants: true }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            fieldEquals('uid', uid),
            fieldEquals('role', 'member'),
            fieldEquals('membershipState', 'active'),
          ],
        },
      },
      limit: 20,
    },
  };
}
