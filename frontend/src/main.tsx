import { initGlassFromSession } from './design/glassTheme';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/inter';
import './design/tokens.css';
import './styles.css';
import './components/components.css';
import './components/visualizations.css';
import './components/buttons.css';
import './components/shell.css';
import './components/glass.css';
import './design/prism.css';
import './components/forms.css';
import './pages/landing.css';
import './pages/login.css';
import './pages/results.css';
import './pages/diagnosis.css';
import './pages/billing.css';
import './pages/account.css';
import './pages/questionnaire.css';
import './pages/report.css';
import './pages/priorities.css';
import './pages/support.css';
import './design/prism-app.css';
import './design/crystal.css';
import './design/preferences.css';


function applyStoredTechnicalPreferences(){
  const root=document.documentElement;
  root.style.colorScheme='light';
}

/* Decorative ambient motion pauses while the tab is hidden (CSS: components/glass.css `html.is-hidden`). */
function pauseAmbientMotionWhenHidden(){
  document.addEventListener('visibilitychange',()=>document.documentElement.classList.toggle('is-hidden',document.hidden));
}

applyStoredTechnicalPreferences();
pauseAmbientMotionWhenHidden();
initGlassFromSession();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

