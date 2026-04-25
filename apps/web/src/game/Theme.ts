/**
 * Visual themes — same geometry, swappable palette. Listeners are notified
 * when activeTheme() changes so renderers can rebuild themselves.
 */

export interface Theme {
  id: ThemeId;
  name: string;
  background: number;
  tileFillA: number;
  tileFillB: number;
  tileEdge: number;
  rockBody: number;
  rockShadow: number;
  treeCanopy: number;
  treeTrunk: number;
  spotWater: number;
  spotGlow: number;
}

export type ThemeId = "mireholm" | "crystal" | "desert";

const MIREHOLM: Theme = {
  id: "mireholm",
  name: "Mireholm Bog",
  background: 0x0b0f14,
  tileFillA: 0x1d2a1a,
  tileFillB: 0x223422,
  tileEdge: 0xf5c14b,
  rockBody: 0x7a5c3a,
  rockShadow: 0x3a2a10,
  treeCanopy: 0x2d5a1b,
  treeTrunk: 0x6b3a1f,
  spotWater: 0x2590cc,
  spotGlow: 0x5ac8f5,
};

const CRYSTAL: Theme = {
  id: "crystal",
  name: "Crystal Cavern",
  background: 0x0a0414,
  tileFillA: 0x1a1438,
  tileFillB: 0x251a4a,
  tileEdge: 0xb070ff,
  rockBody: 0x6040a0,
  rockShadow: 0x301860,
  treeCanopy: 0x4080a0,
  treeTrunk: 0x4a3060,
  spotWater: 0xa040ff,
  spotGlow: 0xff80ff,
};

const DESERT: Theme = {
  id: "desert",
  name: "Sunset Desert",
  background: 0x1a0a08,
  tileFillA: 0x6a3a20,
  tileFillB: 0x804a28,
  tileEdge: 0xffc060,
  rockBody: 0xa07040,
  rockShadow: 0x4a2010,
  treeCanopy: 0x5a6020,
  treeTrunk: 0x402010,
  spotWater: 0x40a0c0,
  spotGlow: 0x80d8ff,
};

const THEMES: Record<ThemeId, Theme> = {
  mireholm: MIREHOLM,
  crystal: CRYSTAL,
  desert: DESERT,
};

let current: Theme = MIREHOLM;
const listeners = new Set<() => void>();

export function activeTheme(): Theme {
  return current;
}

export function setTheme(id: ThemeId): void {
  if (current.id === id) return;
  current = THEMES[id];
  for (const fn of listeners) fn();
}

export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const ALL_THEMES: Theme[] = [MIREHOLM, CRYSTAL, DESERT];
