/** Chaves persistidas em `EventModel.colorKey`. */
export const EVENT_COLOR_PRESETS = [
  { id: 'default', label: 'Azul', accent: '#7a9fc4' },
  { id: 'teal', label: 'Menta', accent: '#7bb8ad' },
  { id: 'violet', label: 'Lavanda', accent: '#a090c8' },
  { id: 'rose', label: 'Rosa', accent: '#d898a8' },
  { id: 'amber', label: 'Pêssego', accent: '#d4a574' },
  { id: 'slate', label: 'Cinza', accent: '#8f96a3' },
] as const;

export type EventColorKey = (typeof EVENT_COLOR_PRESETS)[number]['id'];

export function eventAccentColor(colorKey: string | undefined): string {
  const hit = EVENT_COLOR_PRESETS.find((p) => p.id === colorKey);
  return hit?.accent ?? EVENT_COLOR_PRESETS[0].accent;
}
