export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export type User = { id: string; name: string; email: string; role: 'tourist' | 'owner' | 'admin' };
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API_URL}/api${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ResortHub', 'X-Portal': process.env.NEXT_PUBLIC_PORTAL || 'customer', ...options.headers } }); }
  catch { throw new Error('The API is unavailable. Start all three apps with npm run dev.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'This request could not be completed.');
  return data as T;
}
export const post = <T,>(path: string, data: unknown = {}) => api<T>(path, { method: 'POST', body: JSON.stringify(data) });
export function dateAfter(days: number) { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }

export const assetURL=(image:string)=>image?.startsWith('/uploads/')?`${API_URL}${image}`:image;
