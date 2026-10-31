/** Format a USD price. Rent listings get a "/mo" suffix. */
export function formatPrice(price: number, deal: 'buy' | 'rent'): string {
  const base = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
  return deal === 'rent' ? `${base} /mo` : base;
}

/** Build a placeholder image as an SVG data URI, tinted by hue. */
export function placeholderImage(hue: number, variant = 0): string {
  const h2 = (hue + 40 + variant * 25) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'>
  <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
  <stop offset='0' stop-color='hsl(${hue},55%,62%)'/><stop offset='1' stop-color='hsl(${h2},60%,38%)'/>
  </linearGradient></defs>
  <rect width='800' height='600' fill='url(#g)'/>
  <circle cx='${620 - variant * 60}' cy='130' r='60' fill='hsla(45,100%,85%,.8)'/>
  <path d='M0 470 L800 440 V600 H0Z' fill='hsla(${hue},40%,25%,.55)'/>
  <path d='M230 400 400 260 570 400V500H230Z' fill='hsla(0,0%,100%,.9)'/>
  <path d='M210 410 400 240 590 410' stroke='hsla(${hue},50%,20%,.9)' stroke-width='22' fill='none' stroke-linejoin='round'/>
  <rect x='365' y='400' width='70' height='100' fill='hsl(${hue},45%,30%)'/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
