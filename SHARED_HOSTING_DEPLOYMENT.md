# Shared Hosting Deployment ohne VPS

Diese Variante nutzt das vorhandene Hostinger-Webhosting:

- Frontend: React/Vite wie bisher
- Backend: PHP unter `/api/index.php`
- Datenbank: Hostinger MySQL

Damit ist kein VPS noetig.

## 1. MySQL in Hostinger erstellen

In Hostinger unter `Datenbanken -> Verwaltung` eine neue MySQL-Datenbank und einen Benutzer erstellen.

Notiere:

```text
DB_HOST meistens: localhost
DB_NAME: voller Datenbankname mit Prefix
DB_USER: voller Benutzername mit Prefix
DB_PASSWORD: dein Datenbankpasswort
```

## 2. PHP-Konfiguration anlegen

Nach dem Deploy im Hostinger-Dateimanager in diesem Ordner:

```text
public_html/api/
```

die Datei `config.local.php` anlegen.

Inhalt:

```php
<?php

return [
    'DB_HOST' => 'localhost',
    'DB_NAME' => 'u406044332_DEINNAME',
    'DB_USER' => 'u406044332_DEINUSER',
    'DB_PASSWORD' => 'DEIN_PASSWORT',

    'FRONTEND_URL' => 'https://salmon-jellyfish-485958.hostingersite.com',
    'JWT_SECRET' => 'LANGER_ZUFALLSWERT',
    'SETUP_KEY' => 'LANGER_SETUP_ZUFALLSWERT',

    'BOOTSTRAP_ADMIN_EMAIL' => 'deine.admin@eduscho.at',
    'BOOTSTRAP_ADMIN_PASSWORD' => 'STARKES_ADMIN_PASSWORT',
    'BOOTSTRAP_ADMIN_FIRST_NAME' => 'Admin',
    'BOOTSTRAP_ADMIN_LAST_NAME' => 'Benefit-Bar',

    'SMTP_HOST' => '',
    'SMTP_PORT' => '',
    'SMTP_USER' => '',
    'SMTP_PASSWORD' => '',
    'SMTP_FROM' => '',
    'SMTP_SECURE' => '',

    'MICROSOFT_CLIENT_ID' => '',
    'MICROSOFT_CLIENT_SECRET' => '',
    'MICROSOFT_TENANT_ID' => '',
    'MICROSOFT_REDIRECT_URI' => '',
];
```

Die Datei `config.local.php` wird nicht ins Git geschrieben.

## 3. Frontend neu deployen

Das Frontend braucht fuer diese Variante keine `VITE_API_SERVER_URL`.
Der Standard zeigt jetzt auf:

```text
/api/index.php
```

## 4. Test

Nach dem Deploy:

```text
https://salmon-jellyfish-485958.hostingersite.com/api/index.php/health
```

Erwartung:

```json
{"status":"ok","runtime":"php","database":true}
```

Wenn stattdessen nur `technical_error` erscheint, mit dem Wert aus `SETUP_KEY` testen:

```text
https://salmon-jellyfish-485958.hostingersite.com/api/index.php/health?debug=DEIN_SETUP_KEY
```

Diese Debug-URL zeigt technische Details nur, wenn der Setup-Key stimmt. Den Key und Datenbankpasswoerter nie oeffentlich teilen.

Wenn das funktioniert, laufen Login, Zugang anfordern, Passwort vergessen und Admin-User-Anlage ueber PHP/MySQL.

## 5. Microsoft Redirect URI

Wenn Microsoft OAuth konfiguriert wird:

```text
https://salmon-jellyfish-485958.hostingersite.com/api/index.php/auth/microsoft/callback
```
