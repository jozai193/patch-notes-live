import type { PatchChange } from '@patch-notes-live/mod-api/protocol';

const marks = {
  add: { symbol: '+', className: 'plus' },
  remove: { symbol: '−', className: 'minus' },
  change: { symbol: '~', className: 'changed' },
} as const;
export const changeMark = (change: PatchChange) => marks[change];
export function authorLabel(
  author: string,
  currentAuthor: string,
): { text: string; yours: boolean } {
  const yours = author.trim().toLowerCase() === currentAuthor.trim().toLowerCase();
  return { text: yours ? 'by you' : `by ${author}`, yours };
}
