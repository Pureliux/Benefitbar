<?php

declare(strict_types=1);

require __DIR__ . '/config.php';

header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? '*'));
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    exit;
}

function config_value(string $key, string $default = ''): string
{
    $config = benefitbar_config();
    return (string)($config[$key] ?? $default);
}

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function setup_debug_enabled(): bool
{
    $configuredKey = config_value('SETUP_KEY');
    $submittedKey = (string)($_GET['debug'] ?? '');

    return $configuredKey !== '' && $submittedKey !== '' && hash_equals($configuredKey, $submittedKey);
}

function string_ends_with(string $value, string $suffix): bool
{
    if ($suffix === '') {
        return true;
    }

    return substr($value, -strlen($suffix)) === $suffix;
}

function redirect_to(string $url): void
{
    header('Location: ' . $url, true, 302);
    exit;
}

function request_json(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return $_POST ?: [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function route_path(): string
{
    $path = $_SERVER['PATH_INFO'] ?? '';
    if ($path !== '') {
        return '/' . trim($path, '/');
    }

    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $apiPos = strpos($uriPath, '/api/');
    if ($apiPos !== false) {
        $path = substr($uriPath, $apiPos + 4);
    } else {
        $path = $uriPath;
    }

    $path = preg_replace('#^/index\.php#', '', $path) ?: '/';
    return '/' . trim($path, '/');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = config_value('DB_HOST', 'localhost');
    $name = config_value('DB_NAME');
    $user = config_value('DB_USER');
    $password = config_value('DB_PASSWORD');

    if (!$name || !$user) {
        $payload = [
            'success' => false,
            'error' => 'Datenbank ist nicht konfiguriert.',
            'errorCode' => 'database_not_configured',
        ];

        if (function_exists('benefitbar_config_diagnostics')) {
            $payload['diagnostics'] = benefitbar_config_diagnostics();
        }

        json_response($payload, 500);
    }

    $pdo = new PDO(
        "mysql:host={$host};dbname={$name};charset=utf8mb4",
        $user,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    return $pdo;
}

function migrate(): void
{
    $pdo = db();

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS bb_users (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(190) NOT NULL UNIQUE,
            first_name VARCHAR(120) NOT NULL DEFAULT '',
            last_name VARCHAR(120) NOT NULL DEFAULT '',
            status VARCHAR(40) NOT NULL DEFAULT 'active',
            auth_status VARCHAR(40) NOT NULL DEFAULT 'active',
            password_hash TEXT NULL,
            password_set_at DATETIME NULL,
            login_method VARCHAR(60) NOT NULL DEFAULT 'email_password',
            last_login_at DATETIME NULL,
            is_admin TINYINT(1) NOT NULL DEFAULT 0,
            activation_token_hash CHAR(64) NULL,
            activation_token_expires_at DATETIME NULL,
            reset_token_hash CHAR(64) NULL,
            reset_token_expires_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX idx_email (email),
            INDEX idx_activation_token_hash (activation_token_hash),
            INDEX idx_reset_token_hash (reset_token_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS bb_auth_log (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            action VARCHAR(120) NOT NULL,
            email VARCHAR(190) NULL,
            status VARCHAR(40) NOT NULL,
            error_code VARCHAR(120) NULL,
            error_message TEXT NULL,
            created_at DATETIME NOT NULL,
            INDEX idx_auth_log_created_at (created_at),
            INDEX idx_auth_log_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS bb_email_log (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            recipient VARCHAR(190) NOT NULL,
            subject VARCHAR(255) NOT NULL,
            email_type VARCHAR(120) NOT NULL,
            status VARCHAR(40) NOT NULL,
            sent_at DATETIME NULL,
            error_message TEXT NULL,
            related_user_id INT UNSIGNED NULL,
            created_at DATETIME NOT NULL,
            INDEX idx_email_log_created_at (created_at),
            INDEX idx_email_log_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    bootstrap_admin();
}

function now_sql(): string
{
    return gmdate('Y-m-d H:i:s');
}

function normalize_email(?string $email): string
{
    return strtolower(trim((string)$email));
}

function is_eduscho_email(string $email): bool
{
    return string_ends_with(normalize_email($email), '@eduscho.at');
}

function validate_password_policy(string $password): ?string
{
    if (strlen($password) < 10) {
        return 'Passwort muss mindestens 10 Zeichen lang sein.';
    }
    if (!preg_match('/[A-Z]/', $password)) {
        return 'Passwort muss mindestens einen Großbuchstaben enthalten.';
    }
    if (!preg_match('/[a-z]/', $password)) {
        return 'Passwort muss mindestens einen Kleinbuchstaben enthalten.';
    }
    if (!preg_match('/[0-9]/', $password)) {
        return 'Passwort muss mindestens eine Zahl enthalten.';
    }
    return null;
}

function log_auth(string $action, ?string $email, string $status, ?string $errorCode = null, ?string $errorMessage = null): void
{
    try {
        $stmt = db()->prepare("
            INSERT INTO bb_auth_log (action, email, status, error_code, error_message, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$action, $email, $status, $errorCode, $errorMessage, now_sql()]);
    } catch (Throwable $error) {
        error_log('auth log failed: ' . $error->getMessage());
    }
}

function log_email(string $recipient, string $subject, string $type, string $status, ?string $errorMessage = null, ?int $relatedUserId = null): void
{
    try {
        $stmt = db()->prepare("
            INSERT INTO bb_email_log (recipient, subject, email_type, status, sent_at, error_message, related_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $recipient,
            $subject,
            $type,
            $status,
            in_array($status, ['sent', 'failed'], true) ? now_sql() : null,
            $errorMessage,
            $relatedUserId,
            now_sql(),
        ]);
    } catch (Throwable $error) {
        error_log('email log failed: ' . $error->getMessage());
    }
}

function bootstrap_admin(): void
{
    $email = normalize_email(config_value('BOOTSTRAP_ADMIN_EMAIL'));
    $password = config_value('BOOTSTRAP_ADMIN_PASSWORD');

    if (!$email || !$password || !is_eduscho_email($email)) {
        return;
    }

    $existing = find_user_by_email($email);
    if ($existing) {
        return;
    }

    $now = now_sql();
    $stmt = db()->prepare("
        INSERT INTO bb_users (
            email, first_name, last_name, status, auth_status, password_hash, password_set_at,
            login_method, is_admin, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', 'active', ?, ?, 'email_password', 1, ?, ?)
    ");
    $stmt->execute([
        $email,
        config_value('BOOTSTRAP_ADMIN_FIRST_NAME', 'Admin'),
        config_value('BOOTSTRAP_ADMIN_LAST_NAME', 'Benefit-Bar'),
        password_hash($password, PASSWORD_DEFAULT),
        $now,
        $now,
        $now,
    ]);
}

function find_user_by_email(string $email): ?array
{
    $stmt = db()->prepare('SELECT * FROM bb_users WHERE email = ? LIMIT 1');
    $stmt->execute([normalize_email($email)]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function find_user_by_id(int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM bb_users WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function safe_user(array $user): array
{
    return [
        'id' => (string)$user['id'],
        'email' => $user['email'],
        'firstName' => $user['first_name'],
        'lastName' => $user['last_name'],
        'status' => $user['status'],
        'authStatus' => $user['auth_status'],
        'passwordSet' => !empty($user['password_hash']),
        'passwordSetAt' => $user['password_set_at'],
        'loginMethod' => $user['login_method'],
        'lastLoginAt' => $user['last_login_at'],
        'isAdmin' => (bool)$user['is_admin'],
        'eligibleFrom' => null,
    ];
}

function base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64url_decode(string $value): string
{
    return base64_decode(strtr($value, '-_', '+/')) ?: '';
}

function create_session_token(array $user): string
{
    $secret = config_value('JWT_SECRET');
    if (!$secret) {
        throw new RuntimeException('JWT_SECRET is not configured');
    }

    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $payload = [
        'sub' => (string)$user['id'],
        'email' => $user['email'],
        'isAdmin' => (bool)$user['is_admin'],
        'iat' => time(),
        'exp' => time() + 60 * 60 * 24 * 7,
    ];

    $body = base64url_encode(json_encode($header)) . '.' . base64url_encode(json_encode($payload));
    $signature = hash_hmac('sha256', $body, $secret, true);
    return $body . '.' . base64url_encode($signature);
}

function verify_session_token(?string $token): ?array
{
    $secret = config_value('JWT_SECRET');
    if (!$secret || !$token) {
        return null;
    }

    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    [$header, $payload, $signature] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', $header . '.' . $payload, $secret, true));
    if (!hash_equals($expected, $signature)) {
        return null;
    }

    $decoded = json_decode(base64url_decode($payload), true);
    if (!is_array($decoded) || ($decoded['exp'] ?? 0) < time()) {
        return null;
    }

    return $decoded;
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/i', $header, $matches)) {
        return trim($matches[1]);
    }
    return null;
}

function require_user(): array
{
    $session = verify_session_token(bearer_token());
    if (!$session) {
        json_response(['success' => false, 'error' => 'Authentifizierung erforderlich.', 'errorCode' => 'not_authenticated'], 401);
    }

    $user = find_user_by_id((int)$session['sub']);
    if (!$user) {
        json_response(['success' => false, 'error' => 'Authentifizierung erforderlich.', 'errorCode' => 'not_authenticated'], 401);
    }

    return $user;
}

function require_admin(): array
{
    $user = require_user();
    if (empty($user['is_admin'])) {
        json_response(['success' => false, 'error' => 'Admin-Rechte erforderlich.', 'errorCode' => 'admin_required'], 403);
    }
    return $user;
}

function email_configured(): bool
{
    return config_value('SMTP_HOST') && config_value('SMTP_PORT') && config_value('SMTP_USER') && config_value('SMTP_PASSWORD') && config_value('SMTP_FROM');
}

function smtp_read($socket): string
{
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (preg_match('/^\d{3}\s/', $line)) {
            break;
        }
    }
    return $response;
}

function smtp_command($socket, string $command, array $expected): string
{
    fwrite($socket, $command . "\r\n");
    $response = smtp_read($socket);
    $code = (int)substr($response, 0, 3);
    if (!in_array($code, $expected, true)) {
        throw new RuntimeException("SMTP command failed ({$code}): {$response}");
    }
    return $response;
}

function send_smtp(string $recipient, string $subject, string $html): void
{
    $host = config_value('SMTP_HOST');
    $port = (int)config_value('SMTP_PORT');
    $secure = strtolower(config_value('SMTP_SECURE'));
    $from = config_value('SMTP_FROM');
    $user = config_value('SMTP_USER');
    $password = config_value('SMTP_PASSWORD');

    $remote = ($secure === 'ssl' || $port === 465 ? 'ssl://' : '') . $host . ':' . $port;
    $socket = stream_socket_client($remote, $errno, $errstr, 20, STREAM_CLIENT_CONNECT);
    if (!$socket) {
        throw new RuntimeException("SMTP connection failed: {$errstr}");
    }

    stream_set_timeout($socket, 20);
    smtp_read($socket);
    $ehlo = smtp_command($socket, 'EHLO ' . $host, [250]);

    if (($secure === 'tls' || (!$secure && stripos($ehlo, 'STARTTLS') !== false)) && $port !== 465) {
        smtp_command($socket, 'STARTTLS', [220]);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('SMTP STARTTLS failed');
        }
        smtp_command($socket, 'EHLO ' . $host, [250]);
    }

    smtp_command($socket, 'AUTH LOGIN', [334]);
    smtp_command($socket, base64_encode($user), [334]);
    smtp_command($socket, base64_encode($password), [235, 503]);
    smtp_command($socket, 'MAIL FROM:<' . email_address($from) . '>', [250]);
    smtp_command($socket, 'RCPT TO:<' . $recipient . '>', [250, 251]);
    smtp_command($socket, 'DATA', [354]);

    $headers = [
        'From: ' . $from,
        'To: ' . $recipient,
        'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Date: ' . gmdate('r'),
    ];
    fwrite($socket, implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n.", "\n..", $html) . "\r\n.\r\n");
    $response = smtp_read($socket);
    if ((int)substr($response, 0, 3) !== 250) {
        throw new RuntimeException('SMTP DATA failed: ' . $response);
    }
    smtp_command($socket, 'QUIT', [221, 250]);
    fclose($socket);
}

function email_address(string $value): string
{
    if (preg_match('/<([^>]+)>/', $value, $matches)) {
        return trim($matches[1]);
    }
    return trim($value);
}

function send_email(string $recipient, string $subject, string $html, string $type, ?int $userId = null): array
{
    if (!email_configured()) {
        $message = 'SMTP configuration missing';
        log_email($recipient, $subject, $type, 'failed', $message, $userId);
        return ['success' => false, 'code' => 'email_not_configured', 'error' => $message];
    }

    try {
        send_smtp($recipient, $subject, $html);
        log_email($recipient, $subject, $type, 'sent', null, $userId);
        return ['success' => true];
    } catch (Throwable $error) {
        log_email($recipient, $subject, $type, 'failed', $error->getMessage(), $userId);
        return ['success' => false, 'code' => 'email_send_failed', 'error' => $error->getMessage()];
    }
}

function activation_email(array $user, string $token): array
{
    $link = rtrim(config_value('FRONTEND_URL'), '/') . '/activate?token=' . urlencode($token);
    $name = htmlspecialchars($user['first_name'] ?: $user['email'], ENT_QUOTES, 'UTF-8');
    $html = "<p>Hallo {$name},</p><p>für die Tchibo Benefit-Bar wurde ein Aktivierungslink angefordert.</p><p><a href=\"{$link}\">Passwort setzen</a></p><p>Der Link ist 24 Stunden gültig.</p>";
    return send_email($user['email'], 'Tchibo Benefit-Bar - Zugang aktivieren', $html, 'activation_email', (int)$user['id']);
}

function reset_email(array $user, string $token): array
{
    $link = rtrim(config_value('FRONTEND_URL'), '/') . '/reset-password?token=' . urlencode($token);
    $name = htmlspecialchars($user['first_name'] ?: $user['email'], ENT_QUOTES, 'UTF-8');
    $html = "<p>Hallo {$name},</p><p>du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.</p><p><a href=\"{$link}\">Passwort zurücksetzen</a></p><p>Der Link ist 24 Stunden gültig.</p>";
    return send_email($user['email'], 'Tchibo Benefit-Bar - Passwort zurücksetzen', $html, 'password_reset_email', (int)$user['id']);
}

function token_hash(string $token): string
{
    return hash('sha256', $token);
}

function find_user_by_token(string $column, string $token): ?array
{
    $allowed = ['activation_token_hash', 'reset_token_hash'];
    if (!in_array($column, $allowed, true)) {
        return null;
    }
    $stmt = db()->prepare("SELECT * FROM bb_users WHERE {$column} = ? LIMIT 1");
    $stmt->execute([token_hash($token)]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function microsoft_config_status(): array
{
    $variables = [
        'MICROSOFT_CLIENT_ID' => config_value('MICROSOFT_CLIENT_ID') !== '',
        'MICROSOFT_CLIENT_SECRET' => config_value('MICROSOFT_CLIENT_SECRET') !== '',
        'MICROSOFT_TENANT_ID' => config_value('MICROSOFT_TENANT_ID') !== '',
        'MICROSOFT_REDIRECT_URI' => config_value('MICROSOFT_REDIRECT_URI') !== '',
    ];
    return ['configured' => !in_array(false, $variables, true), 'variables' => $variables];
}

function http_json(string $url, array $options = []): array
{
    $context = stream_context_create($options);
    $body = file_get_contents($url, false, $context);
    if ($body === false) {
        throw new RuntimeException('HTTP request failed');
    }
    $json = json_decode($body, true);
    if (!is_array($json)) {
        throw new RuntimeException('Invalid JSON response');
    }
    return $json;
}

function frontend_redirect(string $path, array $params = []): string
{
    $url = rtrim(config_value('FRONTEND_URL'), '/') . $path;
    if ($params) {
        $url .= '?' . http_build_query($params);
    }
    return $url;
}

function handle_login(): void
{
    $body = request_json();
    $email = normalize_email($body['email'] ?? '');
    $password = (string)($body['password'] ?? '');

    if (!$email || !$password) {
        json_response(['success' => false, 'error' => 'Bitte E-Mail-Adresse und Passwort eingeben.', 'errorCode' => 'missing_credentials'], 400);
    }
    if (!is_eduscho_email($email)) {
        log_auth('login_failed', $email, 'failed', 'invalid_domain');
        json_response(['success' => false, 'error' => 'Bitte verwende deine @eduscho.at-E-Mail-Adresse.', 'errorCode' => 'invalid_domain'], 400);
    }

    $user = find_user_by_email($email);
    if (!$user) {
        log_auth('login_failed', $email, 'failed', 'user_not_found');
        json_response(['success' => false, 'error' => 'Für diese E-Mail-Adresse ist kein aktiver Zugang hinterlegt.', 'errorCode' => 'user_not_found'], 401);
    }
    if ($user['status'] !== 'active' || $user['auth_status'] !== 'active') {
        log_auth('login_failed', $email, 'failed', 'account_inactive');
        json_response(['success' => false, 'error' => 'Dieser Zugang ist aktuell nicht aktiv. Bitte kontaktiere HR/Prozessmanagement.', 'errorCode' => 'account_inactive'], 403);
    }
    if (!$user['password_hash']) {
        log_auth('login_failed', $email, 'failed', 'no_password_set');
        json_response(['success' => false, 'error' => 'Für diesen Zugang wurde noch kein Passwort gesetzt. Bitte fordere einen Aktivierungslink an.', 'errorCode' => 'no_password_set'], 401);
    }
    if (!password_verify($password, $user['password_hash'])) {
        log_auth('login_failed', $email, 'failed', 'invalid_password');
        json_response(['success' => false, 'error' => 'E-Mail-Adresse oder Passwort ist falsch.', 'errorCode' => 'invalid_password'], 401);
    }

    $stmt = db()->prepare("UPDATE bb_users SET last_login_at = ?, login_method = ?, updated_at = ? WHERE id = ?");
    $loginMethod = $user['login_method'] === 'microsoft' ? 'both' : ($user['login_method'] ?: 'email_password');
    $stmt->execute([now_sql(), $loginMethod, now_sql(), $user['id']]);
    $user = find_user_by_id((int)$user['id']);

    log_auth('login_successful', $email, 'success');
    json_response([
        'success' => true,
        'message' => 'Anmeldung erfolgreich.',
        'redirectUrl' => '/dashboard',
        'token' => create_session_token($user),
        'user' => ['id' => (string)$user['id'], 'email' => $user['email'], 'isAdmin' => (bool)$user['is_admin']],
        'employee' => safe_user($user),
    ]);
}

function handle_request_access(): void
{
    $body = request_json();
    $email = normalize_email($body['email'] ?? '');
    $neutral = 'Falls für diese E-Mail-Adresse ein aktiver Zugang besteht, wurde eine E-Mail mit weiteren Schritten versendet.';

    if (!$email) {
        json_response(['success' => false, 'error' => 'Bitte gib deine E-Mail-Adresse ein.', 'errorCode' => 'missing_email'], 400);
    }
    if (!is_eduscho_email($email)) {
        json_response(['success' => false, 'error' => 'Bitte verwende deine @eduscho.at-E-Mail-Adresse.', 'errorCode' => 'invalid_domain'], 400);
    }
    if (!email_configured()) {
        log_email($email, 'Tchibo Benefit-Bar - Zugang aktivieren', 'activation_email', 'failed', 'SMTP configuration missing');
        json_response(['success' => false, 'error' => 'Der E-Mail-Versand ist aktuell nicht konfiguriert. Bitte kontaktiere HR/Prozessmanagement.', 'errorCode' => 'email_not_configured'], 503);
    }

    $user = find_user_by_email($email);
    if (!$user || $user['status'] !== 'active' || $user['auth_status'] === 'locked') {
        log_auth('access_requested', $email, 'failed', $user ? 'account_inactive' : 'user_not_found');
        json_response(['success' => true, 'message' => $neutral]);
    }

    $token = bin2hex(random_bytes(32));
    $expires = gmdate('Y-m-d H:i:s', time() + 86400);
    db()->prepare("UPDATE bb_users SET activation_token_hash = ?, activation_token_expires_at = ?, auth_status = IF(auth_status = 'active', 'active', 'invited'), updated_at = ? WHERE id = ?")
        ->execute([token_hash($token), $expires, now_sql(), $user['id']]);

    $result = activation_email($user, $token);
    if (!$result['success']) {
        json_response(['success' => false, 'error' => 'Die Anfrage konnte technisch nicht verarbeitet werden. Bitte später erneut versuchen.', 'errorCode' => $result['code'] ?? 'email_send_failed'], 500);
    }

    log_auth('activation_link_sent', $email, 'success');
    json_response(['success' => true, 'message' => $neutral]);
}

function handle_forgot_password(): void
{
    $body = request_json();
    $email = normalize_email($body['email'] ?? '');
    $neutral = 'Falls für diese Adresse ein aktiver Zugang besteht, wurde eine E-Mail zum Zurücksetzen des Passworts versendet.';

    if (!$email) {
        json_response(['success' => false, 'error' => 'Bitte gib deine E-Mail-Adresse ein.', 'errorCode' => 'missing_email'], 400);
    }
    if (!is_eduscho_email($email)) {
        json_response(['success' => false, 'error' => 'Bitte verwende deine @eduscho.at-E-Mail-Adresse.', 'errorCode' => 'invalid_domain'], 400);
    }
    if (!email_configured()) {
        log_email($email, 'Tchibo Benefit-Bar - Passwort zurücksetzen', 'password_reset_email', 'failed', 'SMTP configuration missing');
        json_response(['success' => false, 'error' => 'Der E-Mail-Versand ist aktuell nicht konfiguriert. Bitte kontaktiere HR/Prozessmanagement.', 'errorCode' => 'email_not_configured'], 503);
    }

    $user = find_user_by_email($email);
    if (!$user || $user['status'] !== 'active' || $user['auth_status'] !== 'active') {
        json_response(['success' => true, 'message' => $neutral]);
    }

    $token = bin2hex(random_bytes(32));
    $expires = gmdate('Y-m-d H:i:s', time() + 86400);
    db()->prepare("UPDATE bb_users SET reset_token_hash = ?, reset_token_expires_at = ?, updated_at = ? WHERE id = ?")
        ->execute([token_hash($token), $expires, now_sql(), $user['id']]);

    $result = reset_email($user, $token);
    if (!$result['success']) {
        json_response(['success' => false, 'error' => 'Die Anfrage konnte technisch nicht verarbeitet werden. Bitte später erneut versuchen.', 'errorCode' => $result['code'] ?? 'email_send_failed'], 500);
    }

    log_auth('password_reset_requested', $email, 'success');
    json_response(['success' => true, 'message' => $neutral]);
}

function handle_set_password(string $type): void
{
    $body = request_json();
    $token = (string)($body['token'] ?? '');
    $password = (string)($body['password'] ?? '');
    $confirm = (string)($body['passwordConfirm'] ?? '');
    $column = $type === 'activation' ? 'activation_token_hash' : 'reset_token_hash';
    $expiresColumn = $type === 'activation' ? 'activation_token_expires_at' : 'reset_token_expires_at';

    if (!$token || !$password || !$confirm) {
        json_response(['success' => false, 'error' => 'Token und Passwort sind erforderlich.', 'errorCode' => 'missing_fields'], 400);
    }
    if ($password !== $confirm) {
        json_response(['success' => false, 'error' => 'Passwörter stimmen nicht überein.', 'errorCode' => 'password_mismatch'], 400);
    }
    $policyError = validate_password_policy($password);
    if ($policyError) {
        json_response(['success' => false, 'error' => $policyError, 'errorCode' => 'invalid_password_policy'], 400);
    }

    $user = find_user_by_token($column, $token);
    if (!$user || !$user[$expiresColumn] || strtotime($user[$expiresColumn] . ' UTC') < time()) {
        json_response(['success' => false, 'error' => 'Link ist ungültig oder abgelaufen.', 'errorCode' => 'invalid_token'], 400);
    }

    if ($type === 'activation') {
        $sql = "UPDATE bb_users SET password_hash = ?, password_set_at = ?, auth_status = 'active', login_method = IF(login_method = 'microsoft', 'both', 'email_password'), activation_token_hash = NULL, activation_token_expires_at = NULL, updated_at = ? WHERE id = ?";
    } else {
        $sql = "UPDATE bb_users SET password_hash = ?, password_set_at = ?, auth_status = 'active', login_method = IF(login_method = 'microsoft', 'both', 'email_password'), reset_token_hash = NULL, reset_token_expires_at = NULL, updated_at = ? WHERE id = ?";
    }

    db()->prepare($sql)->execute([password_hash($password, PASSWORD_DEFAULT), now_sql(), now_sql(), $user['id']]);
    log_auth($type === 'activation' ? 'password_set' : 'password_reset_completed', $user['email'], 'success');
    json_response(['success' => true, 'message' => 'Passwort wurde gesetzt. Du kannst dich jetzt einloggen.']);
}

function handle_validate_token(): void
{
    $token = (string)($_GET['token'] ?? '');
    if (!$token) {
        json_response(['valid' => false], 400);
    }

    $activation = find_user_by_token('activation_token_hash', $token);
    if ($activation && $activation['activation_token_expires_at'] && strtotime($activation['activation_token_expires_at'] . ' UTC') >= time()) {
        json_response(['valid' => true, 'email' => $activation['email'], 'type' => 'activation', 'expiresAt' => $activation['activation_token_expires_at']]);
    }

    $reset = find_user_by_token('reset_token_hash', $token);
    if ($reset && $reset['reset_token_expires_at'] && strtotime($reset['reset_token_expires_at'] . ' UTC') >= time()) {
        json_response(['valid' => true, 'email' => $reset['email'], 'type' => 'reset', 'expiresAt' => $reset['reset_token_expires_at']]);
    }

    json_response(['valid' => false]);
}

function handle_admin_create_user(): void
{
    $setupKey = config_value('SETUP_KEY');
    $providedSetupKey = $_SERVER['HTTP_X_SETUP_KEY'] ?? '';
    if (!$setupKey || !hash_equals($setupKey, $providedSetupKey)) {
        require_admin();
    }

    $body = request_json();
    $email = normalize_email($body['email'] ?? '');
    $password = (string)($body['password'] ?? '');
    $confirm = (string)($body['confirmPassword'] ?? $body['passwordConfirm'] ?? $password);

    if (!$email || !is_eduscho_email($email)) {
        json_response(['success' => false, 'error' => 'E-Mail-Adresse ist ungültig.', 'errorCode' => 'invalid_email'], 400);
    }
    if (!$password) {
        json_response(['success' => false, 'error' => 'Passwort fehlt.', 'errorCode' => 'missing_password'], 400);
    }
    if ($password !== $confirm) {
        json_response(['success' => false, 'error' => 'Passwörter stimmen nicht überein.', 'errorCode' => 'password_mismatch'], 400);
    }
    $policyError = validate_password_policy($password);
    if ($policyError) {
        json_response(['success' => false, 'error' => $policyError, 'errorCode' => 'invalid_password_policy'], 400);
    }
    if (find_user_by_email($email)) {
        json_response(['success' => false, 'error' => 'Diese E-Mail-Adresse existiert bereits.', 'errorCode' => 'email_exists'], 409);
    }

    $now = now_sql();
    $stmt = db()->prepare("
        INSERT INTO bb_users (
            email, first_name, last_name, status, auth_status, password_hash, password_set_at,
            login_method, is_admin, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, ?, 'email_password', ?, ?, ?)
    ");
    $stmt->execute([
        $email,
        trim((string)($body['firstName'] ?? '')),
        trim((string)($body['lastName'] ?? '')),
        (string)($body['status'] ?? 'active'),
        password_hash($password, PASSWORD_DEFAULT),
        $now,
        !empty($body['isAdmin']) ? 1 : 0,
        $now,
        $now,
    ]);

    log_auth('admin_user_created', $email, 'success');
    json_response(['success' => true, 'message' => 'User wurde erstellt und kann sich jetzt einloggen.']);
}

function handle_admin_send_test_email(): void
{
    require_admin();
    $body = request_json();
    $email = normalize_email($body['email'] ?? '');

    if (!$email) {
        json_response(['success' => false, 'error' => 'E-Mail erforderlich.', 'errorCode' => 'missing_email'], 400);
    }

    $result = send_email(
        $email,
        'Tchibo Benefit-Bar - Test-E-Mail',
        '<p>Dies ist eine Test-E-Mail der Tchibo Benefit-Bar.</p><p>Wenn du diese E-Mail erhalten hast, funktioniert die SMTP-Konfiguration.</p>',
        'test_email'
    );

    if (!$result['success']) {
        json_response(['success' => false, 'error' => 'Test-E-Mail konnte nicht versendet werden. Bitte E-Mail-Konfiguration prüfen.', 'errorCode' => $result['code'] ?? 'email_send_failed'], 500);
    }

    json_response(['success' => true, 'message' => 'Test-E-Mail wurde versendet.']);
}

function handle_admin_test_login(): void
{
    require_admin();
    $body = request_json();
    $email = normalize_email($body['email'] ?? '');
    $password = (string)($body['password'] ?? '');
    $user = $email ? find_user_by_email($email) : null;
    $passed = (bool)($user && $user['status'] === 'active' && $user['auth_status'] === 'active' && $user['password_hash'] && password_verify($password, $user['password_hash']));

    json_response(['success' => true, 'passed' => $passed]);
}

function handle_admin_system_check(): void
{
    require_admin();

    $counts = db()->query("
        SELECT
            SUM(status = 'active') active_users,
            SUM(password_hash IS NOT NULL AND password_hash <> '') users_with_password,
            SUM(password_hash IS NULL OR password_hash = '') users_without_password
        FROM bb_users
    ")->fetch() ?: [];
    $smtp = [
        'SMTP_HOST' => config_value('SMTP_HOST') !== '',
        'SMTP_PORT' => config_value('SMTP_PORT') !== '',
        'SMTP_USER' => config_value('SMTP_USER') !== '',
        'SMTP_PASSWORD' => config_value('SMTP_PASSWORD') !== '',
        'SMTP_FROM' => config_value('SMTP_FROM') !== '',
    ];
    $microsoft = microsoft_config_status();

    $loginErrorsStmt = db()->query("
        SELECT created_at timestamp, email, error_code errorCode
        FROM bb_auth_log
        WHERE status = 'failed' AND action LIKE '%login%'
        ORDER BY created_at DESC
        LIMIT 10
    ");
    $emailErrorsStmt = db()->query("
        SELECT sent_at sentAt, recipient, error_message errorMessage
        FROM bb_email_log
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT 10
    ");

    json_response([
        'success' => true,
        'databaseConnected' => true,
        'authSystemActive' => config_value('JWT_SECRET') !== '',
        'emailServiceConfigured' => email_configured(),
        'smtp' => $smtp,
        'microsoftOAuthConfigured' => $microsoft['configured'],
        'microsoft' => $microsoft['variables'],
        'activeUserCount' => (int)($counts['active_users'] ?? 0),
        'usersWithPassword' => (int)($counts['users_with_password'] ?? 0),
        'usersWithoutPassword' => (int)($counts['users_without_password'] ?? 0),
        'recentLoginErrors' => $loginErrorsStmt->fetchAll(),
        'recentEmailErrors' => $emailErrorsStmt->fetchAll(),
    ]);
}

function handle_microsoft_callback(): void
{
    $code = (string)($_GET['code'] ?? '');
    $status = microsoft_config_status();
    if (!$code || !$status['configured']) {
        redirect_to(frontend_redirect('/login', ['authError' => 'microsoft_failed']));
    }

    try {
        $tenant = config_value('MICROSOFT_TENANT_ID');
        $tokenData = http_json("https://login.microsoftonline.com/{$tenant}/oauth2/v2.0/token", [
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content' => http_build_query([
                    'client_id' => config_value('MICROSOFT_CLIENT_ID'),
                    'client_secret' => config_value('MICROSOFT_CLIENT_SECRET'),
                    'code' => $code,
                    'redirect_uri' => config_value('MICROSOFT_REDIRECT_URI'),
                    'grant_type' => 'authorization_code',
                ]),
            ],
        ]);

        $profile = http_json('https://graph.microsoft.com/v1.0/me', [
            'http' => ['header' => 'Authorization: Bearer ' . $tokenData['access_token'] . "\r\n"],
        ]);

        $email = normalize_email($profile['mail'] ?? $profile['userPrincipalName'] ?? '');
        if (!is_eduscho_email($email)) {
            throw new RuntimeException('invalid_domain');
        }
        $user = find_user_by_email($email);
        if (!$user || $user['status'] !== 'active' || $user['auth_status'] === 'locked') {
            throw new RuntimeException('user_not_active');
        }

        db()->prepare("UPDATE bb_users SET last_login_at = ?, auth_status = 'active', login_method = IF(password_hash IS NULL OR password_hash = '', 'microsoft', 'both'), updated_at = ? WHERE id = ?")
            ->execute([now_sql(), now_sql(), $user['id']]);
        $user = find_user_by_id((int)$user['id']);
        log_auth('microsoft_login_successful', $email, 'success');
        redirect_to(frontend_redirect('/dashboard', ['authToken' => create_session_token($user)]));
    } catch (Throwable $error) {
        log_auth('microsoft_login_failed', null, 'failed', 'technical_error', $error->getMessage());
        redirect_to(frontend_redirect('/login', ['authError' => 'microsoft_failed']));
    }
}

try {
    migrate();
    $path = route_path();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET' && ($path === '/health' || $path === '/')) {
        json_response(['status' => 'ok', 'runtime' => 'php', 'database' => true]);
    }

    if ($method === 'GET' && $path === '/auth/me') {
        $user = require_user();
        json_response([
            'success' => true,
            'user' => ['id' => (string)$user['id'], 'email' => $user['email'], 'isAdmin' => (bool)$user['is_admin']],
            'employee' => safe_user($user),
        ]);
    }
    if ($method === 'POST' && $path === '/auth/login') handle_login();
    if ($method === 'POST' && $path === '/auth/request-access') handle_request_access();
    if ($method === 'POST' && $path === '/auth/forgot-password') handle_forgot_password();
    if ($method === 'POST' && $path === '/auth/activate') handle_set_password('activation');
    if ($method === 'POST' && $path === '/auth/reset-password') handle_set_password('reset');
    if ($method === 'GET' && $path === '/auth/validate-token') handle_validate_token();
    if ($method === 'GET' && $path === '/auth/microsoft/status') json_response(microsoft_config_status());
    if ($method === 'GET' && $path === '/auth/microsoft') {
        $status = microsoft_config_status();
        if (!$status['configured']) {
            log_auth('microsoft_login_not_configured', null, 'failed', 'microsoft_not_configured');
            redirect_to(frontend_redirect('/login', ['authError' => 'microsoft_not_configured']));
        }
        log_auth('microsoft_login_started', null, 'success');
        $params = http_build_query([
            'client_id' => config_value('MICROSOFT_CLIENT_ID'),
            'response_type' => 'code',
            'redirect_uri' => config_value('MICROSOFT_REDIRECT_URI'),
            'response_mode' => 'query',
            'scope' => 'openid profile email User.Read',
        ]);
        redirect_to('https://login.microsoftonline.com/' . config_value('MICROSOFT_TENANT_ID') . '/oauth2/v2.0/authorize?' . $params);
    }
    if ($method === 'GET' && $path === '/auth/microsoft/callback') handle_microsoft_callback();

    if ($method === 'GET' && $path === '/admin/users') {
        require_admin();
        $stmt = db()->query('SELECT * FROM bb_users ORDER BY created_at DESC');
        json_response(['success' => true, 'users' => array_map('safe_user', $stmt->fetchAll())]);
    }
    if ($method === 'POST' && $path === '/admin/create-user') handle_admin_create_user();
    if ($method === 'POST' && $path === '/admin/send-test-email') handle_admin_send_test_email();
    if ($method === 'POST' && $path === '/admin/test-login') handle_admin_test_login();
    if ($method === 'POST' && $path === '/admin/resend-activation-link') {
        require_admin();
        handle_request_access();
    }
    if ($method === 'GET' && $path === '/admin/system-check') handle_admin_system_check();

    json_response(['success' => false, 'error' => 'Route not found', 'path' => $path], 404);
} catch (Throwable $error) {
    error_log($error->getMessage());
    try {
        if (setup_debug_enabled()) {
            json_response([
                'success' => false,
                'error' => 'Technischer Fehler. Bitte spaeter erneut versuchen.',
                'errorCode' => 'technical_error',
                'debug' => [
                    'type' => get_class($error),
                    'message' => $error->getMessage(),
                    'file' => basename($error->getFile()),
                    'line' => $error->getLine(),
                ],
            ], 500);
        }
    } catch (Throwable $debugError) {
        error_log('debug payload failed: ' . $debugError->getMessage());
    }

    json_response([
        'success' => false,
        'error' => 'Technischer Fehler. Bitte später erneut versuchen.',
        'errorCode' => 'technical_error',
    ], 500);
}
