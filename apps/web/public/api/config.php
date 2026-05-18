<?php

function benefitbar_local_config_paths(): array
{
    $paths = [];
    $envPath = getenv('BENEFITBAR_CONFIG_FILE');

    if ($envPath) {
        $paths[] = $envPath;
    }

    $paths[] = __DIR__ . '/benefitbar.config.php';
    $paths[] = __DIR__ . '/config.local.php';
    $paths[] = dirname(__DIR__) . '/benefitbar.config.php';
    $paths[] = dirname(__DIR__) . '/config.local.php';
    $paths[] = dirname(__DIR__, 2) . '/benefitbar.config.php';
    $paths[] = dirname(__DIR__, 2) . '/config.local.php';

    $documentRoot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), "/\\");
    if ($documentRoot !== '') {
        $paths[] = $documentRoot . '/api/benefitbar.config.php';
        $paths[] = $documentRoot . '/api/config.local.php';
        $paths[] = $documentRoot . '/benefitbar.config.php';
        $paths[] = $documentRoot . '/config.local.php';
        $paths[] = dirname($documentRoot) . '/benefitbar.config.php';
        $paths[] = dirname($documentRoot) . '/config.local.php';
    }

    return array_values(array_unique($paths));
}

function benefitbar_string_starts_with(string $value, string $prefix): bool
{
    return $prefix === '' || strncmp($value, $prefix, strlen($prefix)) === 0;
}

function benefitbar_config_path_label(string $path): string
{
    $normalized = str_replace('\\', '/', $path);
    $documentRoot = rtrim(str_replace('\\', '/', (string)($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');

    if ($documentRoot !== '' && benefitbar_string_starts_with($normalized, $documentRoot)) {
        return 'public_html' . substr($normalized, strlen($documentRoot));
    }

    $parentOfDocumentRoot = $documentRoot !== '' ? dirname($documentRoot) : '';
    if ($parentOfDocumentRoot !== '' && benefitbar_string_starts_with($normalized, $parentOfDocumentRoot)) {
        return '..' . substr($normalized, strlen($parentOfDocumentRoot));
    }

    if (benefitbar_string_starts_with($normalized, str_replace('\\', '/', __DIR__))) {
        return 'public_html/api' . substr($normalized, strlen(str_replace('\\', '/', __DIR__)));
    }

    return basename($normalized);
}

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
        'HR_NOTIFICATION_EMAIL' => getenv('HR_NOTIFICATION_EMAIL') ?: 'prozessmanagement@eduscho.at',
    ];

    foreach (benefitbar_local_config_paths() as $localConfig) {
        if (is_file($localConfig)) {
            $local = require $localConfig;
            if (is_array($local)) {
                $config = array_merge($config, $local);
                break;
            }
        }
    }

    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $currentHost = (string)($_SERVER['HTTP_HOST'] ?? '');

    if (!$config['FRONTEND_URL']) {
        $config['FRONTEND_URL'] = $scheme . '://' . ($currentHost ?: 'localhost');
    } elseif (strpos((string)$config['FRONTEND_URL'], 'hostingersite.com') !== false) {
        $config['FRONTEND_URL'] = 'https://tchibo-benefitbar.at';
    }

    return $config;
}

function benefitbar_config_diagnostics(): array
{
    $candidateFiles = [];
    $loadedConfigFile = null;
    $localReturnedArray = false;
    $localKeys = [];
    $localError = null;

    foreach (benefitbar_local_config_paths() as $localConfig) {
        $exists = is_file($localConfig);
        $readable = is_readable($localConfig);
        $candidateFiles[] = [
            'file' => benefitbar_config_path_label($localConfig),
            'exists' => $exists,
            'readable' => $readable,
        ];

        if (!$exists || !$readable || $loadedConfigFile !== null) {
            continue;
        }

        try {
            $local = require $localConfig;
            $localReturnedArray = is_array($local);
            $localKeys = $localReturnedArray ? array_keys($local) : [];
            if ($localReturnedArray) {
                $loadedConfigFile = benefitbar_config_path_label($localConfig);
            }
        } catch (Throwable $error) {
            $localError = $error->getMessage();
        }
    }

    $config = benefitbar_config();

    return [
        'expectedLocalConfigFiles' => [
            '../benefitbar.config.php',
            'public_html/benefitbar.config.php',
            'public_html/api/benefitbar.config.php',
            'public_html/api/config.local.php',
        ],
        'loadedConfigFile' => $loadedConfigFile,
        'configCandidates' => $candidateFiles,
        'configLocalExists' => $loadedConfigFile !== null,
        'configLocalReadable' => $loadedConfigFile !== null,
        'configLocalReturnedArray' => $localReturnedArray,
        'configLocalKeys' => $localKeys,
        'configLocalError' => $localError,
        'requiredValuesPresent' => [
            'DB_HOST' => (string)($config['DB_HOST'] ?? '') !== '',
            'DB_NAME' => (string)($config['DB_NAME'] ?? '') !== '',
            'DB_USER' => (string)($config['DB_USER'] ?? '') !== '',
            'DB_PASSWORD' => (string)($config['DB_PASSWORD'] ?? '') !== '',
            'FRONTEND_URL' => (string)($config['FRONTEND_URL'] ?? '') !== '',
            'JWT_SECRET' => (string)($config['JWT_SECRET'] ?? '') !== '',
            'SETUP_KEY' => (string)($config['SETUP_KEY'] ?? '') !== '',
        ],
    ];
}
