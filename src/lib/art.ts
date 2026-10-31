import type { PropertyType } from '../types';

/** Sky palettes. Variant picks the time of day so gallery shots differ. */
const SKIES = [
  { top: '#aebccb', bottom: '#e7ecf0', sun: '#ffffff', glow: 0, name: 'day' },
  { top: '#c9b79d', bottom: '#f0e6d6', sun: '#ffffff', glow: 1, name: 'golden' },
  { top: '#a3b4c4', bottom: '#e9eef2', sun: '#ffffff', glow: 0, name: 'noon' },
  { top: '#39475c', bottom: '#b79d8a', sun: '#ffffff', glow: 1, name: 'dusk' },
];

/** Shade a hex color. amt in -1..1 (negative darkens). */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** HSL to hex, so listing hue drives wall and roof colors. */
function hsl(h: number, s: number, l: number): string {
  s = (s * 0.55) / 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
}

/** A window pane with sky reflection, optional warm interior light and a frame. */
function windowPane(x: number, y: number, w: number, h: number, lit: boolean, cross = true): string {
  return `<g>
    <rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" fill="#f4efe6"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${lit ? 'url(#lit)' : 'url(#glass)'}"/>
    ${cross ? `<path d="M${x + w / 2} ${y}V${y + h}M${x} ${y + h / 2}H${x + w}" stroke="#f4efe6" stroke-width="2"/>` : ''}
    <path d="M${x} ${y + h}l${w * 0.45} -${h}h${w * 0.18}l-${w * 0.45} ${h}z" fill="#fff" opacity=".13"/>
  </g>`;
}

/** Simple tree: trunk and a layered canopy. Muted greens. */
function tree(x: number, y: number, s: number, lean = 1): string {
  void lean;
  return `<g>
    <rect x="${x - 3 * s}" y="${y - 70 * s}" width="${6 * s}" height="${70 * s}" fill="#6b5a48"/>
    <ellipse cx="${x}" cy="${y - 92 * s}" rx="${38 * s}" ry="${44 * s}" fill="#566b52"/>
    <ellipse cx="${x - 10 * s}" cy="${y - 100 * s}" rx="${24 * s}" ry="${28 * s}" fill="#61785c"/>
  </g>`;
}

/** Round bush. */
const bush = (x: number, y: number, r: number, c = '#566b52') =>
  `<g><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.7}" fill="${c}"/><ellipse cx="${x - r * 0.3}" cy="${y - r * 0.2}" rx="${r * 0.6}" ry="${r * 0.4}" fill="${shade(c, 0.18)}"/></g>`;

/** Modern two-storey villa with flat roof, glass wall and pool. */
function villa(hue: number, lit: boolean): string {
  const wall = hsl(hue, 18, 92), accent = hsl(hue, 30, 38);
  return `
    <rect x="0" y="470" width="800" height="130" fill="#a3ad98"/>
    <path d="M60 520h560l60 40H0z" fill="#d9cfbd"/>
    <path d="M300 505 H700 L760 560 H240z" fill="#7fa3b0"/><path d="M300 505 H700 L690 520 H310z" fill="#5f8796"/>
    <path d="M330 530 H640" stroke="#fff" stroke-width="2" opacity=".5"/>
    <rect x="130" y="370" width="320" height="130" fill="${wall}"/>
    <rect x="130" y="370" width="320" height="130" fill="url(#shadeV)"/>
    <rect x="250" y="270" width="320" height="110" fill="${shade(wall, -0.04)}"/>
    <rect x="236" y="256" width="348" height="16" fill="${accent}"/>
    <rect x="116" y="356" width="348" height="16" fill="${accent}"/>
    <rect x="270" y="288" width="280" height="76" fill="${lit ? 'url(#lit)' : 'url(#glass)'}"/>
    <path d="M410 288v76M340 288v76M480 288v76" stroke="#2b3a42" stroke-width="3"/>
    <rect x="150" y="392" width="200" height="90" fill="${lit ? 'url(#lit)' : 'url(#glass)'}"/>
    <path d="M216 392v90M283 392v90" stroke="#2b3a42" stroke-width="3"/>
    <rect x="378" y="400" width="52" height="100" fill="${accent}"/>
    <rect x="440" y="340" width="150" height="12" fill="#c9bda6"/>
    <path d="M150 392H350M150 482H350" stroke="#2b3a42" stroke-width="3"/>
    ${[460, 490, 520].map((x) => `<rect x="${x}" y="326" width="3" height="28" fill="#cfd6d9"/>`).join('')}
    <path d="M458 326H524" stroke="#cfd6d9" stroke-width="3"/>
    ${tree(660, 500, 1.15, -1)}${tree(95, 505, 0.95)}
    ${bush(120, 505, 26)}${bush(460, 506, 22, '#61785c')}`;
}

/** Colonial wooden house with gabled roof, veranda and columns. */
function house(hue: number, lit: boolean): string {
  const wall = hsl(hue, 22, 90), trim = '#fbf8f1', roof = hsl(hue, 35, 34);
  return `
    <rect x="0" y="450" width="800" height="150" fill="#9ba692"/>
    <path d="M0 520Q400 490 800 520V600H0z" fill="#8e9a85"/>
    <rect x="150" y="300" width="500" height="170" fill="${wall}"/>
    <rect x="150" y="300" width="500" height="170" fill="url(#shadeV)"/>
    <path d="M110 305 L400 170 L690 305z" fill="${roof}"/>
    <path d="M110 305 L400 170 L400 190 L140 310z" fill="${shade(roof, 0.12)}"/>
    <path d="M110 305H690" stroke="${trim}" stroke-width="8"/>
    <path d="M360 262 L400 222 L440 262z" fill="${trim}"/>
    ${windowPane(180, 335, 70, 90, lit)}${windowPane(550, 335, 70, 90, lit)}
    ${windowPane(300, 335, 56, 90, lit)}${windowPane(444, 335, 56, 90, lit)}
    <rect x="368" y="350" width="64" height="120" fill="${hsl(hue, 30, 30)}"/>
    <circle cx="420" cy="414" r="3.5" fill="#e8c35a"/>
    <rect x="130" y="440" width="540" height="36" fill="#cfc4ad"/>
    <rect x="120" y="470" width="560" height="14" fill="#b9ad94"/>
    ${[160, 260, 360, 440, 540, 640].map((x) => `<rect x="${x - 4}" y="316" width="8" height="126" fill="${trim}"/>`).join('')}
    <rect x="140" y="306" width="520" height="10" fill="${trim}"/>
    <path d="M140 442H660" stroke="${trim}" stroke-width="6"/>
    <path d="M400 484 L380 560 H420z" fill="#c9bda6"/>
    ${bush(110, 490, 30)}${bush(690, 492, 32, '#61785c')}
    ${tree(745, 500, 1.1, -1)}${tree(55, 505, 0.9)}`;
}

/** Mid-rise apartment block with a window grid and balconies. */
function apartment(hue: number, lit: boolean): string {
  const wall = hsl(hue, 16, 86), band = hsl(hue, 30, 42);
  let rows = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const x = 205 + c * 66, y = 170 + r * 62;
      const on = lit ? (r * 7 + c * 3) % 3 !== 0 : false;
      rows += windowPane(x, y, 38, 36, on, false);
      rows += `<rect x="${x - 8}" y="${y + 38}" width="54" height="8" fill="${band}"/>`;
    }
  }
  return `
    <rect x="0" y="460" width="800" height="140" fill="#8d9094"/>
    <rect x="0" y="470" width="800" height="12" fill="#a9acaf"/>
    <path d="M0 540H800" stroke="#f1f1f1" stroke-width="3" stroke-dasharray="40 30"/>
    <rect x="170" y="130" width="460" height="340" fill="${wall}"/>
    <rect x="170" y="130" width="460" height="340" fill="url(#shadeV)"/>
    <rect x="160" y="118" width="480" height="18" fill="${band}"/>
    <rect x="320" y="96" width="160" height="26" fill="${shade(wall, -0.1)}"/>
    ${rows}
    <rect x="170" y="410" width="460" height="60" fill="${shade(wall, -0.12)}"/>
    <rect x="350" y="414" width="100" height="56" fill="url(#glass)"/>
    <path d="M400 414v56" stroke="#2b3a42" stroke-width="3"/>
    <rect x="335" y="402" width="130" height="10" fill="${band}"/>
    ${bush(150, 476, 24)}${bush(655, 478, 24, '#61785c')}
    ${tree(95, 480, 1.0)}${tree(720, 482, 1.1, -1)}`;
}

/** Empty plot: fence, grass, trees and a sale sign. */
function land(hue: number): string {
  void hue;
  return `
    <rect x="0" y="400" width="800" height="200" fill="#a1ab97"/>
    <path d="M0 470 Q200 430 420 470 T800 450 V600 H0z" fill="#95a08b"/>
    <path d="M0 540 Q300 500 800 540 V600 H0z" fill="#889580"/>
    <path d="M0 520 L800 470" stroke="#8a6d4b" stroke-width="5"/><path d="M0 548 L800 500" stroke="#8a6d4b" stroke-width="5"/>
    ${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 62 + 8}" y="${500 - i * 3.6}" width="8" height="64" fill="#9b7d57"/>`).join('')}
    <rect x="300" y="360" width="8" height="110" fill="#6b5236"/><rect x="370" y="360" width="8" height="110" fill="#6b5236"/>
    <rect x="285" y="340" width="110" height="62" rx="4" fill="#fbf8f1"/><rect x="285" y="340" width="110" height="62" rx="4" fill="none" stroke="#7a2e2e" stroke-width="4"/>
    <text x="340" y="368" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="16" fill="#7a2e2e">FOR SALE</text>
    <text x="340" y="388" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#333">Building plot</text>
    ${tree(120, 470, 1.2)}${tree(690, 462, 1.0, -1)}${tree(600, 468, 0.8)}
    ${bush(220, 480, 34, '#61785c')}${bush(520, 486, 28)}`;
}

/** Corner shop with awning, shopfront glass and signage. */
function commercial(hue: number, lit: boolean): string {
  const wall = hsl(hue, 14, 82), awn = '#7a2e2e';
  const stripes = Array.from({ length: 10 }, (_, i) => `<rect x="${170 + i * 46}" y="318" width="23" height="44" fill="${i % 2 ? '#fbf8f1' : awn}"/>`).join('');
  return `
    <rect x="0" y="470" width="800" height="130" fill="#8f9296"/>
    <rect x="0" y="470" width="800" height="14" fill="#b2b6b9"/>
    <rect x="130" y="150" width="540" height="330" fill="${wall}"/>
    <rect x="130" y="150" width="540" height="330" fill="url(#shadeV)"/>
    <rect x="120" y="136" width="560" height="18" fill="${shade(wall, -0.25)}"/>
    ${[0, 1, 2, 3].map((i) => windowPane(165 + i * 128, 180, 76, 84, lit)).join('')}
    <rect x="170" y="270" width="460" height="38" rx="4" fill="${hsl(hue, 30, 30)}"/>
    <text x="400" y="297" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="22" fill="#fbf8f1" letter-spacing="3">RETAIL UNIT</text>
    ${stripes}
    <path d="M160 362H640L660 380H140z" fill="${shade(awn, -0.25)}"/>
    <rect x="170" y="384" width="290" height="96" fill="${lit ? 'url(#lit)' : 'url(#glass)'}"/>
    <path d="M267 384v96M364 384v96" stroke="#2b3a42" stroke-width="3"/>
    <rect x="490" y="384" width="110" height="96" fill="url(#glass)"/><path d="M545 384v96" stroke="#2b3a42" stroke-width="3"/>
    <rect x="610" y="384" width="26" height="96" fill="${hsl(hue, 30, 30)}"/>
    ${tree(75, 490, 1.0)}${tree(740, 492, 0.9, -1)}`;
}

/**
 * Build a detailed scene for a property type. Variant changes sky and light so
 * the gallery shows the same home at different times of day.
 */
export function sceneSvg(hue: number, variant: number, type: PropertyType): string {
  const sky = SKIES[((variant % 4) + 4) % 4];
  const lit = sky.name === 'dusk' || sky.name === 'golden';
  const body =
    type === 'Villa' ? villa(hue, lit)
    : type === 'Apartment' ? apartment(hue, lit)
    : type === 'Land' ? land(hue)
    : type === 'Commercial' ? commercial(hue, lit)
    : house(hue, lit);
  const dim = sky.name === 'dusk' ? 0.28 : sky.name === 'golden' ? 0.08 : 0;

  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600' preserveAspectRatio='xMidYMid slice'>
  <defs>
    <linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${sky.top}'/><stop offset='1' stop-color='${sky.bottom}'/></linearGradient>
    <linearGradient id='glass' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#8fc7e6'/><stop offset='1' stop-color='#2f5f7a'/></linearGradient>
    <linearGradient id='lit' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffe29a'/><stop offset='1' stop-color='#f5a742'/></linearGradient>
    <linearGradient id='shadeV' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.1'/></linearGradient>
    <radialGradient id='sun'><stop offset='0' stop-color='${sky.sun}'/><stop offset='1' stop-color='${sky.sun}' stop-opacity='0'/></radialGradient>
  </defs>
  <rect width='800' height='600' fill='url(#sky)'/>
  <path d='M0 400 Q120 330 260 395 T520 380 T800 395 V470 H0z' fill='${hsl(hue, 25, 52)}' opacity='.55'/>
  <path d='M0 430 Q200 380 420 430 T800 420 V480 H0z' fill='#7c8a76' opacity='.8'/>
  ${body}
  <rect width='800' height='600' fill='#0b1b3a' opacity='${dim}'/>
</svg>`;
}
