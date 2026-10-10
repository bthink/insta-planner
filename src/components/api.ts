export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${url}`, {
    ...options,
    cache: "no-store",
    headers: {
      ...(options?.body && typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Nie udało się wykonać operacji.");
  return data as T;
}
export function mutation(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}
