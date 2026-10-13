import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "../utils/supabaseClient";

export interface PackOwnership {
  ownedPackIds: string[];
  isOfficial: boolean;
  signedIn: boolean;
  loaded: boolean;
}

const EMPTY: PackOwnership = { ownedPackIds: [], isOfficial: false, signedIn: false, loaded: false };

// Owned packs for the current user from GET /api/me/packs. Free sample items are
// usable without owning anything, so an empty list still allows samples.
// `refreshKey` (e.g. the username) refetches after sign-in/out.
export function usePackOwnership(refreshKey?: string | null): PackOwnership {
  const [state, setState] = useState<PackOwnership>(EMPTY);

  const load = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/me/packs", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setState({ ...EMPTY, loaded: true });
        return;
      }
      const data = await res.json();
      setState({
        ownedPackIds: Array.isArray(data.ownedPackIds) ? data.ownedPackIds.map(String) : [],
        isOfficial: Boolean(data.isOfficial),
        signedIn: Boolean(data.signedIn),
        loaded: true,
      });
    } catch (err) {
      console.error("Could not load owned packs:", err);
      setState({ ...EMPTY, loaded: true });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return state;
}
