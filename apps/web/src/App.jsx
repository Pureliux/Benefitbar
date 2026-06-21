import React from 'react';

function App() {
	return (
		<main className="error-page">
			<section className="error-shell" role="alert" aria-labelledby="error-title">
				<p className="error-code">Error 503</p>
				<h1 id="error-title">Seite vorübergehend nicht verfügbar</h1>
				<p className="error-message">Ein unerwarteter Fehler ist aufgetreten.</p>
			</section>
		</main>
	);
}

export default App;
