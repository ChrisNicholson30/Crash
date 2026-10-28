import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { MotionGlobalConfig } from 'motion/react';
import { App } from './ui/App.tsx';
import { Crashed } from './ui/Crashed.tsx';
import { onSettings } from './ui/settings.ts';
// Fonts are bundled and precached, so they work offline (no Google Fonts requests).
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/manrope';
import './ui/theme.css';
import './ui/effects.css';
import './ui/extras.css';
import './ui/noir.css';

registerSW({ immediate: true });
// Motion can be switched off in settings (the phone's reduce-motion setting is respected too).
onSettings((s) => {
  MotionGlobalConfig.skipAnimations = !s.motion;
  document.documentElement.classList.toggle('still', !s.motion);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crashed>
      <App />
    </Crashed>
  </StrictMode>,
);
