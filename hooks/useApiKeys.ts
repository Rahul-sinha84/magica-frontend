"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ApiKey, ApiKeyListResponse, CreateApiKeyBody, UpdateApiKeyBody } from "@/contracts";
import { ApiError } from "@/lib/queryClient";
import { useApi } from "./useApi";

export const apiKeysQueryKey = ["api-keys"] as const;

// The backend names the field a refusal is about ("label: Give the key a name."); the form already shows which.
export const keyError = (error: Error) => (error instanceof ApiError ? error.message : "Something went wrong. Try again.").replace(/^\w+: /, "");

const isGone = (error: Error) => error instanceof ApiError && error.status === 404;

// The user's API keys, while the dialog is open. Revoked keys aren't listed; expired ones are, and don't count
// towards the limit.
export function useApiKeys(enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: apiKeysQueryKey, queryFn: ({ signal }) => api.apiKeys.list(signal), enabled, staleTime: 0 });
}

// What can be done with them. Each answer updates the list in place; a key that is gone (revoked elsewhere, or not
// this user's) leaves the list, and the server's own list is asked for again so the counter is right.
export function useApiKeyActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const edit = (change: (data: ApiKeyListResponse) => ApiKeyListResponse) =>
    queryClient.setQueryData<ApiKeyListResponse>(apiKeysQueryKey, (data) => data && change(data));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: apiKeysQueryKey });

  const drop = (id: string) =>
    edit((data) => {
      const key = data.apiKeys.find((k) => k.id === id);
      return { ...data, apiKeys: data.apiKeys.filter((k) => k.id !== id), activeCount: data.activeCount - (key?.status === "active" ? 1 : 0) };
    });
  const gone = (id: string) => {
    drop(id);
    refresh();
    toast.error("That key isn't there any more", { description: "It may have been revoked somewhere else." });
  };

  // the secret comes back from here and goes no further than the caller: it is never put in the cache
  const create = useMutation({
    mutationFn: (body: CreateApiKeyBody) => api.apiKeys.create(body),
    onSuccess: ({ apiKey }) => {
      edit((data) => ({
        ...data,
        apiKeys: [apiKey, ...data.apiKeys.filter((k) => k.id !== apiKey.id)],
        activeCount: data.activeCount + (apiKey.status === "active" ? 1 : 0),
      }));
    },
    // 409: the limit was reached elsewhere meanwhile; the list catches up
    onError: (error) => error instanceof ApiError && error.status === 409 && refresh(),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateApiKeyBody }) => api.apiKeys.update(id, body),
    onSuccess: ({ apiKey }) => edit((data) => ({ ...data, apiKeys: data.apiKeys.map((k) => (k.id === apiKey.id ? apiKey : k)) })),
    onError: (error, { id }) => isGone(error) && gone(id),
  });

  const revoke = useMutation({
    mutationFn: (key: ApiKey) => api.apiKeys.revoke(key.id),
    onSuccess: (_, key) => drop(key.id),
    onError: (error, key) => {
      if (isGone(error)) gone(key.id);
      else if (!(error instanceof ApiError && error.status === 401)) toast.error("Couldn't revoke the key", { description: keyError(error) });
    },
  });

  return { create, update, revoke };
}
