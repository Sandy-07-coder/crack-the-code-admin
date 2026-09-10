// Read the API base from environment or fallback to localhost:4000
export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export async function api(path, opts = {}, adminKey = null) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (adminKey) headers['x-admin-key'] = adminKey;
  
  const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
  const data = await res.json().catch(() => ({}));
  
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
