export interface Palette {
  name: string;
  colors: string[];
}

export const palettes: Palette[] = [
  {
    name: 'PICO-8',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751',
      '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436',
      '#29adff', '#83769c', '#ff77a8', '#ffccaa'
    ]
  },
  {
    name: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
  },
  {
    name: 'DawnBringer 16',
    colors: [
      '#140c1c', '#442434', '#30346d', '#4e4a4e',
      '#854c30', '#346524', '#d04648', '#757161',
      '#597dce', '#d27d2c', '#8595a1', '#6daa2c',
      '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6'
    ]
  },
  {
    name: 'AAP-16',
    colors: [
      '#070708', '#332222', '#774433', '#cc8855',
      '#993311', '#dd7711', '#ffdd55', '#ffffcc',
      '#55aa44', '#115522', '#44bbcc', '#2255aa',
      '#553388', '#9955aa', '#dd99bb', '#ffffff'
    ]
  },
  {
    name: 'UI Basics',
    colors: [
      '#111827', '#374151', '#6b7280', '#d1d5db',
      '#ffffff', '#ef4444', '#f97316', '#f59e0b',
      '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
      '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'
    ]
  }
];
