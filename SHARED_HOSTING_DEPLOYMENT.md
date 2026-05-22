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

Alternativ kann die komplette Datenbankverbindung als Hostinger-Umgebungsvariable gesetzt werden:

```text
DATABASE_URL=mysql://u406044332_benefitbar:DEIN_PASSWORT@localhost/u406044332_benefitbar
```

Das ist hilfreich, wenn Hostinger Dateien wie `benefitbar.config.php` bei einer erneuten Bereitstellung entfernt.

## 2. PHP-Konfiguration anlegen

Nach dem Deploy im Hostinger-Dateimanager im Account-Root, also neben `public_html`:

```text
benefitbar.config.php
```

Die Datei nicht in `public_html/api` ablegen, weil dieser Ordner bei Deployments ueberschrieben werden kann.

Inhalt:

```php
<?php

return [
    'DB_HOST' => 'localhost',
    'DB_NAME' => 'u406044332_DEINNAME',
    'DB_USER' => 'u406044332_DEINUSER',
    'DB_PASSWORD' => 'DEIN_PASSWORT',

    'FRONTEND_URL' => 'https://tchibo-benefitbar.at',
    'JWT_SECRET' => 'LANGER_ZUFALLSWERT',
    'ALLOWED_LOGIN_EMAILS' => 'amirtirana@outlook.de',
    'SETUP_KEY' => 'LANGER_SETUP_ZUFALLSWERT',

    'BOOTSTRAP_ADMIN_EMAIL' => 'deine.admin@eduscho.at',
    'BOOTSTRAP_ADMIN_PASSWORD' => 'STARKES_ADMIN_PASSWORT',
    'BOOTSTRAP_ADMIN_FIRST_NAME' => 'Admin',
    'BOOTSTRAP_ADMIN_LAST_NAME' => 'Benefit-Bar',

    'SMTP_HOST' => 'smtp.hostinger.com',
    'SMTP_PORT' => '465',
    'SMTP_USER' => 'no-reply@tchibo-benefitbar.at',
    'SMTP_PASSWORD' => 'ECHTES_HOSTINGER_MAILBOX_PASSWORT',
    'SMTP_FROM' => 'Tchibo Benefitbar <no-reply@tchibo-benefitbar.at>',
    'SMTP_SECURE' => 'ssl',
    'ALLOW_PHP_MAIL' => 'false',
    'MAIL_TRANSPORT' => 'smtp',
    'PHP_MAIL_FROM' => 'Tchibo Benefitbar <no-reply@tchibo-benefitbar.at>',
];
```

Die Datei `benefitbar.config.php` wird nicht ins Git geschrieben.

Wichtig: Der Aktivierungslink wird nur als erfolgreich angezeigt, wenn der SMTP-Server die Nachricht annimmt. `MAIL_TRANSPORT` muss auf `smtp` stehen; `ALLOW_PHP_MAIL` sollte auf `false` bleiben, damit Hostinger `mail()` nicht versehentlich als scheinbarer Versand genutzt wird.

## 3. Frontend neu deployen

Das Frontend braucht fuer diese Variante keine `VITE_API_SERVER_URL`.
Der Standard zeigt jetzt auf:

```text
/api/index.php
```

## 4. Test

Nach dem Deploy:

```text
https://tchibo-benefitbar.at/api/index.php/health
```

Erwartung:

```json
{"status":"ok","runtime":"php","database":true}
```

Wenn stattdessen nur `technical_error` erscheint, mit dem Wert aus `SETUP_KEY` testen:

```text
https://tchibo-benefitbar.at/api/index.php/health?debug=DEIN_SETUP_KEY
```

Diese Debug-URL zeigt technische Details nur, wenn der Setup-Key stimmt. Den Key und Datenbankpasswoerter nie oeffentlich teilen.

Wenn das funktioniert, laufen Login, Zugang anfordern, Passwort vergessen und Admin-User-Anlage ueber PHP/MySQL.
