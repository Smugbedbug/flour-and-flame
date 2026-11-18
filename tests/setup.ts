import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';

// Every test starts with a brand-new, empty browser database (like a fresh install).
beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); });
if (!globalThis.structuredClone) (globalThis as any).structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v));
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => cleanup());
import { vi } from 'vitest';
// Tests run against made-up recipes so no personal recipe ever has to live in the public code.
vi.mock('../src/seeds', async () => ({ seeds: (await import('./fixtures')).testRecipes }));
