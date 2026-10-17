import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';
import App from './App.tsx';
import './index.css';
import './packs/packs.css';

// Owner opt-out for Vercel Analytics. Visit any page with ?analytics=off once per
// browser to stop counting your own visits (?analytics=on turns it back on).
const ANALYTICS_OPT_OUT_KEY = 'reax_no_analytics';
function readAnalyticsOptOut(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('analytics');
    if (flag === 'off') localStorage.setItem(ANALYTICS_OPT_OUT_KEY, '1');
    if (flag === 'on') localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
    if (flag === 'off' || flag === 'on') {
      params.delete('analytics');
      const qs = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    }
    return localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}
const analyticsOptOut = readAnalyticsOptOut();
const beforeSendAnalytics = (event: BeforeSendEvent) => (analyticsOptOut ? null : event);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={beforeSendAnalytics} />
  </StrictMode>,
);
