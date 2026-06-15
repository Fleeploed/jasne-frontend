/**
 * Shared session lifecycle helpers.
 *
 * Every sign-out path — the explicit one in AuthProvider and the forced ones
 * in api.ts / sse.ts after an unrecoverable 401 — must go through
 * performSignOut() so the next user on this device never inherits the
 * previous user's analytics identity, purchases, query cache, or the
 * persisted chat threads (which contain scanned-document content).
 */

import { invalidateChatCache } from "@/features/chat/chatThreadCache";
import { clearCachedProfile } from "@/features/auth/profileCache";
import { clearPendingScans } from "@/features/scans/pendingScanStore";
import { clearPinnedScans } from "@/features/scans/pinnedScansStore";
import { resetAnalyticsUser } from "@/lib/analytics";
import { clearPurchasesIdentity } from "@/lib/purchases";
import { persister, queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

let signOutPromise: Promise<void> | null = null;
let refreshPromise: Promise<boolean> | null = null;

type SignOutTask = () => Promise<void> | void;

const signOutTasks = new Set<SignOutTask>();

/**
 * Register extra cleanup to run during sign-out while the session is still
 * valid (e.g. unregistering the push token on the backend). Keeps the module
 * graph acyclic: features depend on session.ts, never the other way around.
 */
export function registerSignOutTask(task: SignOutTask): () => void {
  signOutTasks.add(task);
  return () => signOutTasks.delete(task);
}

export function performSignOut(): Promise<void> {
  // Concurrent failing requests may all decide to sign out — run it once.
  if (!signOutPromise) {
    signOutPromise = signOutOnce().finally(() => {
      signOutPromise = null;
    });
  }
  return signOutPromise;
}

async function signOutOnce() {
  // Best-effort cleanup that needs the still-valid session (push token
  // unregistration etc.) — run it first, never let it block the sign-out.
  await Promise.all(
    Array.from(signOutTasks, async (task) => {
      try {
        await task();
      } catch {
        // Sign-out must proceed regardless.
      }
    })
  );

  // Reset local identities before Supabase sign-out so the next user on
  // this device doesn't inherit analytics or purchases.
  resetAnalyticsUser();
  await clearPurchasesIdentity();
  queryClient.clear();
  // Also wipe the persisted copy so the next user on this device can't restore
  // the previous account's trackings/entitlement from AsyncStorage.
  await persister.removeClient();
  invalidateChatCache();
  clearPendingScans();
  await Promise.all([clearPinnedScans(), clearCachedProfile()]);
  await supabase.auth.signOut();
}

/**
 * Try to refresh the Supabase session once. Deduplicates concurrent callers
 * (several requests hitting 401 at the same moment trigger a single refresh).
 * Returns true when a fresh session is available.
 */
export function refreshSessionOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = supabase.auth
      .refreshSession()
      .then(({ data, error }) => !error && Boolean(data.session))
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Recovery path for a 401 on a request that won't be retried (SSE streams):
 * refresh the session so the user's next attempt succeeds, and only sign
 * out when the refresh itself fails (the session is truly gone).
 */
export async function recoverSessionOrSignOut(): Promise<void> {
  const refreshed = await refreshSessionOnce();
  if (!refreshed) await performSignOut();
}
