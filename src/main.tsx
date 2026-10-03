import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { MotionGlobalConfig } from 'motion/react';
import { App } from './ui/App.tsx';
// Fonts are bundled and precached, so they work offline (no Google Fonts requests).
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/manrope';
import './ui/theme.css';
import './ui/effects.css';

registerSW({ immediate: true });
// A still, no-frills table: every motion animation jumps straight to its end state.
MotionGlobalConfig.skipAnimations = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
