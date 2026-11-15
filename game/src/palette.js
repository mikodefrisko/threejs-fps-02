// Look plan: six named colours; lighting and canvas textures make every shade the game needs.
export const PALETTE = {
  canvas: '#0e1216',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#ece7db',
  muted: '#98a0a8',
  accent: '#f0a830',
  amber: '#ff8c2e',
  cobalt: '#3fa7ff',
  danger: '#ff4d3d',
  good: '#58d68d',
};
export function shade(name) { return PALETTE[name]; }
