// Which client and which driver position a campaign belongs to, from its name.
// Names look like "GREENLINE LOGISTICS/ LID /LINEHAUL-TEAM/NETWORK · 2026-10-15".

export const CLIENTS = { greenline: 'Greenline Logistics', freitty: 'Freitty' } as const;
export type ClientId = keyof typeof CLIENTS;

const POSITIONS: [RegExp, string][] = [
  [/FORKLIFT/, 'Forklift'],
  [/FLATBED/, 'Flatbed'],
  [/PD[- ]?SOLO/, 'PD Solo'],
  [/SHORT[- ]?HAUL/, 'Short-haul Solo'],
  [/TEAM/, 'Linehaul Team'],
  [/LOCAL/, 'Local'],
  [/OTR/, 'OTR Solo'],
  [/SOLO|LINEHAUL/, 'Linehaul Solo'],
  [/CROSS[- ]?DOCK/, 'Cross Docking'],
  [/YARD/, 'Yard Space'],
];

// Newer names start with the client ("GREENLINE LOGISTICS/ LID/..."), older ones carry it
// in the middle ("Lid/ TEAM DRIVERS / Greenline Logistics./ USA / RU"), so match anywhere.
export function classify(campaignName: string): { client: ClientId; brand: string; position: string } {
  const n = (campaignName || '').trim().toUpperCase();
  let client: ClientId = 'freitty';
  let brand = 'Freight Box Hub';
  if (n.includes('GREENLINE')) { client = 'greenline'; brand = 'Greenline Logistics'; }
  else if (n.includes('MYWORK')) brand = 'MyWork';
  else if (n.includes('FREITTY')) brand = 'Freitty';
  const position = POSITIONS.find(([re]) => re.test(n))?.[1] ?? 'Інше';
  return { client, brand, position };
}

/** Campaign name without the client prefix and the "LID" segment, for tables. */
export function shortName(name: string): string {
  const n = String(name || '')
    .replace(/^\s*(GREENLINE LOGISTICS|MYWORK|FREITTY)\s*\/\s*/i, '')
    .replace(/^LID\s*\/\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return n || String(name || '');
}
