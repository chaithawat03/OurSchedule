import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { firebaseClient } from '../../services/firebaseClient';
import { createIdentityService, ensureOwnProfile, identityErrorMessage } from '../../services/identity';

export type IdentityState =
  | { status: 'unconfigured'; user: null }
  | { status: 'loading'; user: null }
  | { status: 'signed-out'; user: null }
  | { status: 'ready'; user: User }
  | { status: 'error'; user: User | null; message: string };

export function useIdentity() {
  const [state, setState] = useState<IdentityState>(
    firebaseClient ? { status: 'loading', user: null } : { status: 'unconfigured', user: null },
  );
  const [busy, setBusy] = useState(false);
  const service = useMemo(
    () => firebaseClient ? createIdentityService(firebaseClient.auth) : null,
    [],
  );

  useEffect(() => {
    if (!firebaseClient) return;
    let active = true;
    let sessionGeneration = 0;
    const { auth, db } = firebaseClient;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const generation = ++sessionGeneration;
      if (!active) return;
      if (!user) {
        setState({ status: 'signed-out', user: null });
        return;
      }
      setState({ status: 'loading', user: null });
      void ensureOwnProfile(user, db)
        .then(() => { if (active && generation === sessionGeneration) setState({ status: 'ready', user }); })
        .catch((error: unknown) => {
          if (active && generation === sessionGeneration) setState({ status: 'error', user, message: identityErrorMessage(error) });
        });
    }, (error) => {
      if (active) setState({ status: 'error', user: null, message: identityErrorMessage(error) });
    });
    return () => { active = false; sessionGeneration++; unsubscribe(); };
  }, []);

  const signIn = useCallback(async () => {
    if (!service || busy) return;
    setBusy(true);
    try {
      await service.loginWithGoogle();
    } catch (error: unknown) {
      setState({ status: 'error', user: null, message: identityErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }, [service, busy]);

  const signOut = useCallback(async () => {
    if (!service || busy) return;
    setBusy(true);
    try {
      await service.logout();
    } catch (error: unknown) {
      setState({ status: 'error', user: null, message: identityErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }, [service, busy]);

  return { state, busy, signIn, signOut };
}
