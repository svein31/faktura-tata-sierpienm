import { ApiError } from '@/lib/api';
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Oczekiwano obiektu.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, field: string, required = true, max = 200): string {
  if ((value === undefined || value === null || value === '') && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new ApiError(400, `Nieprawidłowe pole: ${field}.`);
  return value.trim();
}
export function amount(value: unknown, field: string, negative = false): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(?:[.,]\d{1,2})?$/.test(value.trim()) ? Number(value.replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > 1e10 || (!negative && n < 0)) throw new ApiError(400, `Nieprawidłowa kwota: ${field}.`);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function date(value: unknown, field: string, required = true): string {
  const s = text(value, field, required, 10);
  if (!s && !required) return '';
  const d = new Date(s + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new ApiError(400, `Nieprawidłowa data: ${field} (RRRR-MM-DD).`);
  return s;
}
export function objectId(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw new ApiError(400, `Nieprawidłowy identyfikator: ${field}.`);
  return value;
}
export function nipValid(s: string) {
  const n = s.replace(/[\s-]/g, '').replace(/^PL/i, '');
  return /^\d{10}$/.test(n) && !/^(\d)\1{9}$/.test(n) && [6,5,7,2,3,4,5,6,7].reduce((a,w,i)=>a+w*Number(n[i]),0)%11===Number(n[9]);
}
export function ibanValid(s: string) {
  let n = s.replace(/\s/g, '').toUpperCase();
  if (/^\d{26}$/.test(n)) n = 'PL' + n;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(n)) return false;
  const digits = (n.slice(4)+n.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
  return [...digits].reduce((r,d)=>(r*10+Number(d))%97,0)===1;
}
