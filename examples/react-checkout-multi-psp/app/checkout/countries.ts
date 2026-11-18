/** The countries the example lets you switch between, one per route. */
export const COUNTRIES = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'DE', name: 'Germany' },
  { code: 'US', name: 'United States' },
] as const;

export type Country = (typeof COUNTRIES)[number]['code'];

export function isCountry(value: unknown): value is Country {
  return COUNTRIES.some((country) => country.code === value);
}
