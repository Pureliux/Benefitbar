# Backend Deployment

Dieses Projekt hat bereits ein Backend. Es muss separat als Node.js-App laufen, wenn das Frontend in Hostinger Horizons nur statisch ausgeliefert wird.

## 1. Backend-App anlegen

In Hostinger/VPS eine neue Node.js-App aus diesem GitHub-Repository deployen.

Empfohlene Einstellungen:

```text
Root-Verzeichnis: ./
Node-Version: 22.x
Build-Befehl: npm run build
Start-Befehl: npm run start
Eingabedatei, falls abgefragt: apps/api/src/main.js
```

Falls der Backend-Host keinen Frontend-Build braucht, kann der Build-Befehl leer bleiben. Der Start-Befehl bleibt `npm run start`.

## 2. Backend-Umgebungsvariablen

Diese Variablen im Backend-Hosting setzen:

```env
START_POCKETBASE=true
POCKETBASE_URL=http://localhost:8090
POCKETBASE_HEALTH_RETRIES=30

FRONTEND_URL=https://salmon-jellyfish-485958.hostingersite.com
CORS_ORIGIN=https://salmon-jellyfish-485958.hostingersite.com

JWT_SECRET=CHANGE_ME_LONG_RANDOM_VALUE
PB_ENCRYPTION_KEY=CHANGE_ME_LONG_RANDOM_VALUE
PB_SUPERUSER_EMAIL=admin@example.com
PB_SUPERUSER_PASSWORD=CHANGE_ME_STRONG_PASSWORD
```

E-Mail-Versand:

```env
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

Microsoft Login:

```env
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
MICROSOFT_REDIRECT_URI=https://DEINE-BACKEND-DOMAIN/hcgi/api/auth/microsoft/callback
```

## 3. Frontend mit Backend verbinden

Im Hostinger-Horizons-Frontend diese Build-Variablen setzen und danach das Frontend neu deployen:

```env
VITE_API_SERVER_URL=https://DEINE-BACKEND-DOMAIN/hcgi/api
VITE_POCKETBASE_API_URL=https://DEINE-BACKEND-DOMAIN/hcgi/platform
```

`DEINE-BACKEND-DOMAIN` ist nicht die Horizons-Frontend-Domain, sondern die URL der separat laufenden Node.js-App.

## 4. Tests

Backend testen:

```text
https://DEINE-BACKEND-DOMAIN/hcgi/api/health
```

Erwartete Antwort:

```json
{"status":"ok"}
```

PocketBase-Proxy testen:

```text
https://DEINE-BACKEND-DOMAIN/hcgi/platform/api/health
```

Wenn `/hcgi/api/health` HTML oder die Login-Seite zurueckgibt, dann wird noch das Frontend getroffen und nicht das Backend.

## 5. Datenbank-Hinweis

Keine Supabase- oder MongoDB-Verbindung in Hostinger auswaehlen. Die App nutzt PocketBase mit eigener SQLite-Datenbank.
