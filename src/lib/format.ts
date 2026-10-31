import type { PropertyType } from '../types';
import { sceneSvg } from './art';

/** Format a USD price. Rent listings get a "/mo" suffix. */
export function formatPrice(price: number, deal: 'buy' | 'rent'): string {
  const base = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
  return deal === 'rent' ? `${base} /mo` : base;
}

/** Build an illustrated property image as an SVG data URI. Type picks the architecture, variant picks the light. */
export function placeholderImage(hue: number, variant = 0, type: PropertyType = 'House'): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(sceneSvg(hue, variant, type))}`;
}
