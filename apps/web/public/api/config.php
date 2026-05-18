<?php

function benefitbar_config(): array
{
    static $config = null;

    if ($config !== null) {
        return $config;
    }

    $config = [
        'DB_HOST' => getenv('DB_HOST') ?: getenv('MYSQL_HOST') ?: 'localhost',
        'DB_NAME' => getenv('DB_NAME') ?: getenv('MYSQL_DATABASE') ?: '',
        'DB_USER' => getenv('DB_USER') ?: getenv('MYSQL_USER') ?: '',
        'DB_PASSWORD' => getenv('DB_PASSWORD') ?: getenv('MYSQL_PASSWORD') ?: '',
        'FRONTEND_URL' => getenv('FRONTEND_URL') ?: '',
        'JWT_SECRET' => getenv('JWT_SECRET') ?: '',
        'SETUP_KEY' => getenv('SETUP_KEY') ?: '',
        'BOOTSTRAP_ADMIN_EMAIL' => getenv('BOOTSTRAP_ADMIN_EMAIL') ?: '',
        'BOOTSTRAP_ADMIN_PASSWORD' => getenv('BOOTSTRAP_ADMIN_PASSWORD') ?: '',
        'BOOTSTRAP_ADMIN_FIRST_NAME' => getenv('BOOTSTRAP_ADMIN_FIRST_NAME') ?: 'Admin',
        'BOOTSTRAP_ADMIN_LAST_NAME' => getenv('BOOTSTRAP_ADMIN_LAST_NAME') ?: 'Benefit-Bar',
        'SMTP_HOST' => getenv('SMTP_HOST') ?: '',
        'SMTP_PORT' => getenv('SMTP_PORT') ?: '',
        'SMTP_USER' => getenv('SMTP_USER') ?: '',
        'SMTP_PASSWORD' => getenv('SMTP_PASSWORD') ?: '',
        'SMTP_FROM' => getenv('SMTP_FROM') ?: '',
        'SMTP_SECURE' => getenv('SMTP_SECURE') ?: '',
        'MICROSOFT_CLIENT_ID' => getenv('MICROSOFT_CLIENT_ID') ?: '',
        'MICROSOFT_CLIENT_SECRET' => getenv('MICROSOFT_CLIENT_SECRET') ?: '',
        'MICROSOFT_TENANT_ID' => getenv('MICROSOFT_TENANT_ID') ?: '',
        'MICROSOFT_REDIRECT_URI' => getenv('MICROSOFT_REDIRECT_URI') ?: '',
    ];

    $localConfig = __DIR__ . '/config.local.php';
    if (is_file($localConfig)) {
        $local = require $localConfig;
        if (is_array($local)) {
            $config = array_merge($config, $local);
        }
    }

    if (!$config['FRONTEND_URL']) {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $config['FRONTEND_URL'] = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }

    return $config;
}
