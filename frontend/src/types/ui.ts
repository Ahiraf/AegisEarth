import type { SearchResult } from '../services/provider';

/** Where the search currently is. */
export type SearchUi =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; result: SearchResult };

/** Which observation is in comparison slot A and slot B (by id). */
export type Selection = { a: string | null; b: string | null };
export type Slot = 'a' | 'b';
