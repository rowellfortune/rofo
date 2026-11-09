/**
 * Runs before every component test file.
 * Adds the DOM matchers (toBeInTheDocument and friends) and fills gaps jsdom leaves.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no object URLs. The listing editor uses them for photo previews.
if (!URL.createObjectURL) {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
}

// jsdom does not scroll. The editor scrolls to the first error.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
});
