/**
 * Isometric projection — classic 2:1 (TILE_W : TILE_H = 2 : 1) RuneScape-era
 * 3/4 view. World tile (col, row) projects to a diamond on screen; sprites
 * stand at the diamond's centre. tick()-based renderers go through these
 * helpers so all coords are consistent.
 *
 *   tile (0,0) is at world origin.
 *   +col goes "down-right" on screen, +row goes "down-left" — so the visual
 *   y-axis is the average (col + row), making depth-sort simple.
 */

export const TILE_W = 96; // diamond width in screen px
export const TILE_H = 48; // diamond height in screen px (2:1 ratio)
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

/** World grid dimensions, mirrored from the server's 50×50 zone. */
export const GRID_W = 50;
export const GRID_H = 50;

/** Tile centre in world pixel space. */
export function tileToIso(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * HALF_W,
    y: (col + row) * HALF_H,
  };
}

/** Inverse of tileToIso. Returns fractional tile coords; caller floors as needed. */
export function isoToTile(x: number, y: number): { col: number; row: number } {
  return {
    col: (x / HALF_W + y / HALF_H) / 2,
    row: (y / HALF_H - x / HALF_W) / 2,
  };
}

/** zIndex used to depth-sort sprites — back-row tiles draw first. */
export function tileDepth(col: number, row: number): number {
  return col + row;
}
