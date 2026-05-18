import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';

const APP_VERSION = '2026-05-18-real-pins-smtp-help-v15';

async function refreshIfAppShellIsStale() {
	if (!('fetch' in window)) {
		return;
	}

	try {
		const response = await fetch(`/app-version.json?ts=${Date.now()}`, {
			cache: 'no-store',
			headers: { Accept: 'application/json' },
		});

		if (!response.ok) {
			return;
		}

		const payload = await response.json();
		const refreshedVersion = sessionStorage.getItem('benefitbar-refresh-version');
		if (payload?.version && payload.version !== APP_VERSION && refreshedVersion !== payload.version) {
			sessionStorage.setItem('benefitbar-refresh-version', payload.version);
			window.location.reload();
		}
	} catch {
		// Version checks must never block the app.
	}
}

refreshIfAppShellIsStale();

ReactDOM.createRoot(document.getElementById('root')).render(
	<App />
);
