import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

// jsdom has no native top layer or dialog keyboard behavior. These minimal
// lifecycle shims let us test React handlers; real modality remains browser QA.
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value() { this.open = true; },
});
Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value() { this.open = false; },
});
