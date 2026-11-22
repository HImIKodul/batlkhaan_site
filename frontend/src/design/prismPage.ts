import { useEffect } from 'react';
import { useAmbientEnvironment } from './environment';

/** Body class only: every page (shell) sits in the White Prism system. Scopes design/prism.css and design/prism-app.css. */
export function usePrismBody(admin = false) {
  useEffect(() => {
    document.body.classList.add('mmri-prism-page');
    if (admin) document.body.classList.add('mmri-admin');
    return () => document.body.classList.remove('mmri-prism-page', 'mmri-admin');
  }, [admin]);
}

/** Pages that use the White Prism system (plain white environment, ink type, silver glass). Scopes design/prism.css. */
export function usePrismPage() {
  useAmbientEnvironment('prism');
  useEffect(() => {
    document.body.classList.add('mmri-prism-page');
    return () => document.body.classList.remove('mmri-prism-page');
  }, []);
}
