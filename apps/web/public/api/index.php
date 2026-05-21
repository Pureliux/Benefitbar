<?php

declare(strict_types=1);

require __DIR__ . '/config.php';

const BENEFITBAR_API_VERSION = '2026-05-21-hr-yearly-review-v31';
const LOGIN_EMAIL_ERROR_MESSAGE = 'Bitte verwende deine @eduscho.at-Adresse oder eine freigegebene E-Mail-Adresse.';
const FIRST_BENEFIT_YEAR = 2027;
const FIRST_SELECTION_OPEN_DATE = '2026-05-21';

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
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
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

function database_config_present(): bool
{
    $config = benefitbar_config();

    return (string)($config['DB_HOST'] ?? '') !== ''
        && (string)($config['DB_NAME'] ?? '') !== ''
        && (string)($config['DB_USER'] ?? '') !== ''
        && (string)($config['DB_PASSWORD'] ?? '') !== '';
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
            is_hr TINYINT(1) NOT NULL DEFAULT 0,
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

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS bb_benefit_years (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            year INT UNSIGNED NOT NULL UNIQUE,
            annual_budget DECIMAL(10,2) NOT NULL DEFAULT 1000.00,
            process_open_date DATE NULL,
            submission_deadline DATETIME NULL,
            reminder_date DATE NULL,
            auto_assignment_date DATE NULL,
            review_deadline DATETIME NULL,
            status VARCHAR(40) NOT NULL DEFAULT 'open',
            allow_custom_benefits TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX idx_benefit_year_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS bb_benefits (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            benefit_year_id INT UNSIGNED NOT NULL,
            title VARCHAR(190) NOT NULL,
            description TEXT NULL,
            category VARCHAR(120) NOT NULL DEFAULT '',
            fixed_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            payout_mode VARCHAR(40) NOT NULL DEFAULT 'one_time',
            receipt_required TINYINT(1) NOT NULL DEFAULT 1,
            active TINYINT(1) NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 0,
            is_default_auto_assignment TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX idx_benefit_year (benefit_year_id),
            INDEX idx_benefit_active (active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS bb_submissions (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNSIGNED NOT NULL,
            benefit_year_id INT UNSIGNED NOT NULL,
            status VARCHAR(40) NOT NULL DEFAULT 'draft',
            submitted_at DATETIME NULL,
            total_selected_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            covered_by_company_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            employee_own_contribution_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            remaining_budget DECIMAL(10,2) NOT NULL DEFAULT 1000.00,
            monthly_payout_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            admin_comment TEXT NULL,
            needs_info_reason TEXT NULL,
            hr_decided_by INT UNSIGNED NULL,
            hr_decided_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY uniq_user_year (user_id, benefit_year_id),
            INDEX idx_submission_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS bb_selected_benefits (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            submission_id INT UNSIGNED NOT NULL,
            benefit_id INT UNSIGNED NULL,
            is_custom_benefit TINYINT(1) NOT NULL DEFAULT 0,
            custom_title VARCHAR(190) NULL,
            custom_description TEXT NULL,
            requested_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            covered_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            own_contribution_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            payout_mode VARCHAR(40) NOT NULL DEFAULT 'one_time',
            monthly_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            status VARCHAR(40) NOT NULL DEFAULT 'selected',
            hr_review_status VARCHAR(40) NOT NULL DEFAULT 'open',
            hr_review_note TEXT NULL,
            hr_reviewed_by INT UNSIGNED NULL,
            hr_reviewed_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX idx_selected_submission (submission_id),
            INDEX idx_selected_benefit (benefit_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS bb_attachments (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            selected_benefit_id INT UNSIGNED NOT NULL,
            user_id INT UNSIGNED NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_path VARCHAR(255) NOT NULL,
            file_type VARCHAR(120) NOT NULL DEFAULT '',
            file_blob LONGBLOB NULL,
            file_size INT UNSIGNED NULL,
            uploaded_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL,
            INDEX idx_attachment_selected (selected_benefit_id),
            INDEX idx_attachment_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    ensure_column($pdo, 'bb_users', 'is_hr', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER is_admin');
    ensure_column($pdo, 'bb_benefit_years', 'auto_assignment_date', 'DATE NULL AFTER reminder_date');
    ensure_column($pdo, 'bb_benefit_years', 'review_deadline', 'DATETIME NULL AFTER auto_assignment_date');
    ensure_column($pdo, 'bb_submissions', 'needs_info_reason', 'TEXT NULL AFTER admin_comment');
    ensure_column($pdo, 'bb_submissions', 'hr_decided_by', 'INT UNSIGNED NULL AFTER needs_info_reason');
    ensure_column($pdo, 'bb_submissions', 'hr_decided_at', 'DATETIME NULL AFTER hr_decided_by');
    ensure_column($pdo, 'bb_selected_benefits', 'hr_review_status', "VARCHAR(40) NOT NULL DEFAULT 'open' AFTER status");
    ensure_column($pdo, 'bb_selected_benefits', 'hr_review_note', 'TEXT NULL AFTER hr_review_status');
    ensure_column($pdo, 'bb_selected_benefits', 'hr_reviewed_by', 'INT UNSIGNED NULL AFTER hr_review_note');
    ensure_column($pdo, 'bb_selected_benefits', 'hr_reviewed_at', 'DATETIME NULL AFTER hr_reviewed_by');
    ensure_column($pdo, 'bb_attachments', 'file_blob', 'LONGBLOB NULL AFTER file_type');
    ensure_column($pdo, 'bb_attachments', 'file_size', 'INT UNSIGNED NULL AFTER file_blob');
    backfill_attachment_blobs($pdo);

    seed_benefit_data($pdo);
    ensure_base_benefit_calendar($pdo);
    bootstrap_admin();
}

function valid_migration_target(string $table, string $column): bool
{
    $allowedTables = ['bb_users', 'bb_auth_log', 'bb_email_log', 'bb_benefit_years', 'bb_benefits', 'bb_submissions', 'bb_selected_benefits', 'bb_attachments'];
    return in_array($table, $allowedTables, true) && preg_match('/^[a-zA-Z0-9_]+$/', $column) === 1;
}

function column_exists(PDO $pdo, string $table, string $column): bool
{
    if (!valid_migration_target($table, $column)) {
        throw new RuntimeException('invalid_migration_column');
    }

    $stmt = $pdo->prepare("
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
    ");
    $stmt->execute([$table, $column]);

    return (int)$stmt->fetchColumn() > 0;
}

function strip_after_clause(string $definition): string
{
    return trim((string)preg_replace('/\s+AFTER\s+`?[a-zA-Z0-9_]+`?\s*$/i', '', $definition));
}

function after_column_name(string $definition): ?string
{
    if (preg_match('/\s+AFTER\s+`?([a-zA-Z0-9_]+)`?\s*$/i', $definition, $matches) === 1) {
        return $matches[1];
    }

    return null;
}

function duplicate_column_error(Throwable $error): bool
{
    $message = strtolower($error->getMessage());
    return strpos($message, 'duplicate column') !== false || strpos($message, '1060') !== false || (string)$error->getCode() === '42S21';
}

function ensure_column(PDO $pdo, string $table, string $column, string $definition): void
{
    if (!valid_migration_target($table, $column)) {
        throw new RuntimeException('invalid_migration_column');
    }

    if (column_exists($pdo, $table, $column)) {
        return;
    }

    $afterColumn = after_column_name($definition);
    $definitionToUse = $definition;
    if ($afterColumn !== null && !column_exists($pdo, $table, $afterColumn)) {
        $definitionToUse = strip_after_clause($definition);
    }

    try {
        $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definitionToUse}");
    } catch (Throwable $error) {
        if (duplicate_column_error($error) || column_exists($pdo, $table, $column)) {
            return;
        }

        $fallbackDefinition = strip_after_clause($definitionToUse);
        if ($fallbackDefinition !== $definitionToUse) {
            $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$fallbackDefinition}");
            return;
        }

        throw $error;
    }
}

function active_process_benefit_year_number(): int
{
    $currentYear = (int)gmdate('Y');
    $month = (int)gmdate('n');

    if ($currentYear < 2027) {
        return 2027;
    }

    return $month >= 8 ? $currentYear + 1 : $currentYear;
}

function benefit_year_schedule(int $benefitYear): array
{
    $processYear = $benefitYear - 1;
    $processOpenDate = $benefitYear === FIRST_BENEFIT_YEAR
        ? FIRST_SELECTION_OPEN_DATE
        : sprintf('%d-08-01', $processYear);

    return [
        'process_open_date' => $processOpenDate,
        'submission_deadline' => sprintf('%d-10-31 23:59:00', $processYear),
        'reminder_date' => sprintf('%d-10-24', $processYear),
        'review_deadline' => sprintf('%d-12-31 23:59:00', $processYear),
    ];
}

function default_seed_benefits(): array
{
    return [
        ['Yoga-Kurs', 'Kurse für Bewegung, Achtsamkeit und mentale Gesundheit.', 'Gesundheit', 200, 'one_time', 1, 10, 0],
        ['Wiener Öffi-Ticket', 'Zuschuss für öffentliche Verkehrsmittel und nachhaltige Mobilität.', 'Mobilität', 460, 'monthly_12', 1, 20, 1],
        ['Fitness-Zuschuss', 'Mitgliedschaft, Kurse oder Trainingsangebote für deine Fitness.', 'Fitness', 300, 'one_time', 1, 30, 0],
        ['Weiterbildung', 'Seminare, Kurse oder Fachliteratur für deine berufliche Entwicklung.', 'Weiterbildung', 500, 'one_time', 1, 40, 0],
        ['Gesundheitscheck', 'Vorsorge, Beratung oder anerkannte Gesundheitsleistungen.', 'Gesundheit', 250, 'one_time', 1, 50, 0],
        ['Homeoffice-Ausstattung', 'Arbeitsmittel für einen guten Arbeitsplatz zuhause.', 'Arbeitsplatz', 350, 'one_time', 1, 60, 0],
        ['Essens-/Verpflegungszuschuss', 'Unterstützung für Mahlzeiten und gesunde Ernährung.', 'Ernährung', 600, 'monthly_12', 1, 70, 1],
    ];
}

function ensure_benefit_year_record(PDO $pdo, int $year): int
{
    $stmt = $pdo->prepare('SELECT * FROM bb_benefit_years WHERE `year` = ? LIMIT 1');
    $stmt->execute([$year]);
    $benefitYear = $stmt->fetch();
    $schedule = benefit_year_schedule($year);
    $now = now_sql();

    if ($benefitYear) {
        $processOpenSql = $year === FIRST_BENEFIT_YEAR ? '?' : 'COALESCE(process_open_date, ?)';
        $nextStatus = (string)($benefitYear['status'] ?? 'open');
        if ($nextStatus === 'archived' && $year >= 2027) {
            $nextStatus = 'open';
        }

        $pdo->prepare("
            UPDATE bb_benefit_years
            SET process_open_date = {$processOpenSql},
                submission_deadline = COALESCE(submission_deadline, ?),
                reminder_date = COALESCE(reminder_date, ?),
                review_deadline = COALESCE(review_deadline, ?),
                status = ?,
                updated_at = ?
            WHERE id = ?
        ")->execute([
            $schedule['process_open_date'],
            $schedule['submission_deadline'],
            $schedule['reminder_date'],
            $schedule['review_deadline'],
            $nextStatus,
            $now,
            $benefitYear['id'],
        ]);
        return (int)$benefitYear['id'];
    }

    $pdo->prepare("
        INSERT INTO bb_benefit_years (
            `year`, annual_budget, process_open_date, submission_deadline, reminder_date,
            review_deadline, status, allow_custom_benefits, created_at, updated_at
        ) VALUES (?, 1000.00, ?, ?, ?, ?, 'open', 1, ?, ?)
    ")->execute([
        $year,
        $schedule['process_open_date'],
        $schedule['submission_deadline'],
        $schedule['reminder_date'],
        $schedule['review_deadline'],
        $now,
        $now,
    ]);

    return (int)$pdo->lastInsertId();
}

function benefit_count(PDO $pdo, int $benefitYearId): int
{
    $countStmt = $pdo->prepare('SELECT COUNT(*) count FROM bb_benefits WHERE benefit_year_id = ?');
    $countStmt->execute([$benefitYearId]);
    return (int)($countStmt->fetch()['count'] ?? 0);
}

function copy_benefits_from_previous_year(PDO $pdo, int $targetYearId, int $targetYear): bool
{
    $sourceStmt = $pdo->prepare("
        SELECT id
        FROM bb_benefit_years
        WHERE `year` < ?
        ORDER BY `year` DESC
        LIMIT 1
    ");
    $sourceStmt->execute([$targetYear]);
    $source = $sourceStmt->fetch();
    if (!$source || benefit_count($pdo, (int)$source['id']) === 0) {
        return false;
    }

    $now = now_sql();
    $copyStmt = $pdo->prepare("
        INSERT INTO bb_benefits (
            benefit_year_id, title, description, category, fixed_amount, payout_mode,
            receipt_required, active, sort_order, is_default_auto_assignment, created_at, updated_at
        )
        SELECT ?, title, description, category, fixed_amount, payout_mode,
            receipt_required, active, sort_order, is_default_auto_assignment, ?, ?
        FROM bb_benefits
        WHERE benefit_year_id = ?
        ORDER BY sort_order ASC, id ASC
    ");
    $copyStmt->execute([$targetYearId, $now, $now, $source['id']]);
    return true;
}

function ensure_benefits_for_year(PDO $pdo, int $benefitYearId, int $year): void
{
    if (benefit_count($pdo, $benefitYearId) > 0) {
        normalize_seed_benefit_copy($pdo, $benefitYearId);
        return;
    }

    if (copy_benefits_from_previous_year($pdo, $benefitYearId, $year)) {
        normalize_seed_benefit_copy($pdo, $benefitYearId);
        return;
    }

    $benefits = default_seed_benefits();
    $now = now_sql();

    $insert = $pdo->prepare("
        INSERT INTO bb_benefits (
            benefit_year_id, title, description, category, fixed_amount, payout_mode,
            receipt_required, active, sort_order, is_default_auto_assignment, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    ");

    foreach ($benefits as $benefit) {
        $insert->execute([
            $benefitYearId,
            $benefit[0],
            $benefit[1],
            $benefit[2],
            $benefit[3],
            $benefit[4],
            $benefit[5],
            $benefit[6],
            $benefit[7],
            $now,
            $now,
        ]);
    }

    normalize_seed_benefit_copy($pdo, $benefitYearId);
}

function seed_benefit_data(PDO $pdo): void
{
    $year = active_process_benefit_year_number();
    $benefitYearId = ensure_benefit_year_record($pdo, $year);
    ensure_benefits_for_year($pdo, $benefitYearId, $year);
}

function ensure_base_benefit_calendar(PDO $pdo): void
{
    $now = now_sql();
    $pdo->prepare("UPDATE bb_benefit_years SET status = 'archived', updated_at = ? WHERE `year` = 2026 AND status <> 'archived'")
        ->execute([$now]);

    $benefitYearId = ensure_benefit_year_record($pdo, 2027);
    ensure_benefits_for_year($pdo, $benefitYearId, 2027);
}

function normalize_german_copy(?string $value): string
{
    $text = (string)$value;
    $replacements = [
        'fuer' => 'für',
        'Fuer' => 'Für',
        'oeffentliche' => 'öffentliche',
        'Oeffentliche' => 'Öffentliche',
        'Oeffi' => 'Öffi',
        'oeffi' => 'öffi',
        'Mobilitaet' => 'Mobilität',
        'mobilitaet' => 'mobilität',
        'Ernaehrung' => 'Ernährung',
        'ernaehrung' => 'ernährung',
        'Unterstuetzung' => 'Unterstützung',
        'unterstuetzung' => 'unterstützung',
        'ausgewaehlt' => 'ausgewählt',
        'Ausgewaehlt' => 'Ausgewählt',
        'waehlen' => 'wählen',
        'Waehlen' => 'Wählen',
        'gewaehlt' => 'gewählt',
        'Gewaehlt' => 'Gewählt',
        'pruefen' => 'prüfen',
        'Pruefen' => 'Prüfen',
        'ueber 12 Monate' => 'über 12 Monate',
        'Ueber 12 Monate' => 'Über 12 Monate',
        'Grossbuchstaben' => 'Großbuchstaben',
    ];

    return strtr($text, $replacements);
}

function normalize_seed_benefit_copy(PDO $pdo, int $benefitYearId): void
{
    $stmt = $pdo->prepare('SELECT id, title, description, category FROM bb_benefits WHERE benefit_year_id = ?');
    $stmt->execute([$benefitYearId]);
    $update = $pdo->prepare('UPDATE bb_benefits SET title = ?, description = ?, category = ?, updated_at = ? WHERE id = ?');

    foreach ($stmt->fetchAll() as $benefit) {
        $title = normalize_german_copy($benefit['title'] ?? '');
        $description = normalize_german_copy($benefit['description'] ?? '');
        $category = normalize_german_copy($benefit['category'] ?? '');

        if ($title !== ($benefit['title'] ?? '') || $description !== ($benefit['description'] ?? '') || $category !== ($benefit['category'] ?? '')) {
            $update->execute([$title, $description, $category, now_sql(), $benefit['id']]);
        }
    }
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

function allowed_login_emails(): array
{
    $configured = config_value('ALLOWED_LOGIN_EMAILS', 'amirtirana@outlook.de');
    $emails = array_map(function ($email) {
        return normalize_email((string)$email);
    }, explode(',', $configured));

    return array_values(array_filter($emails));
}

function is_allowed_login_email(string $email): bool
{
    $normalized = normalize_email($email);
    return filter_var($normalized, FILTER_VALIDATE_EMAIL)
        && (is_eduscho_email($normalized) || in_array($normalized, allowed_login_emails(), true));
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

    if (!$email || !$password || !is_allowed_login_email($email)) {
        return;
    }

    $existing = find_user_by_email($email);
    if ($existing) {
        $now = now_sql();
        $updates = [
            'status' => 'active',
            'auth_status' => 'active',
            'is_admin' => 1,
            'updated_at' => $now,
        ];

        if (!password_verify($password, (string)($existing['password_hash'] ?? ''))) {
            $updates['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
            $updates['password_set_at'] = $now;
            $updates['login_method'] = 'email_password';
        } elseif (empty($existing['login_method'])) {
            $updates['login_method'] = 'email_password';
        }

        if (trim((string)$existing['first_name']) === '') {
            $updates['first_name'] = config_value('BOOTSTRAP_ADMIN_FIRST_NAME', 'Admin');
        }
        if (trim((string)$existing['last_name']) === '') {
            $updates['last_name'] = config_value('BOOTSTRAP_ADMIN_LAST_NAME', 'Benefitbar');
        }

        $assignments = [];
        $values = [];
        foreach ($updates as $column => $value) {
            $assignments[] = "{$column} = ?";
            $values[] = $value;
        }
        $values[] = $existing['id'];

        db()->prepare('UPDATE bb_users SET ' . implode(', ', $assignments) . ' WHERE id = ?')->execute($values);
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
        config_value('BOOTSTRAP_ADMIN_LAST_NAME', 'Benefitbar'),
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
        'isHr' => (bool)($user['is_hr'] ?? false),
        'eligibleFrom' => null,
    ];
}

function safe_benefit_year(array $year): array
{
    return [
        'id' => (string)$year['id'],
        'year' => (int)$year['year'],
        'annualBudget' => (float)$year['annual_budget'],
        'processOpenDate' => $year['process_open_date'],
        'submissionDeadline' => $year['submission_deadline'],
        'reminderDate' => $year['reminder_date'],
        'autoAssignmentDate' => $year['auto_assignment_date'],
        'reviewDeadline' => $year['review_deadline'] ?? null,
        'status' => $year['status'],
        'allowCustomBenefits' => (bool)$year['allow_custom_benefits'],
    ];
}

function safe_benefit(array $benefit): array
{
    return [
        'id' => (string)$benefit['id'],
        'benefitYearId' => (string)$benefit['benefit_year_id'],
        'title' => normalize_german_copy($benefit['title'] ?? ''),
        'description' => normalize_german_copy($benefit['description'] ?? ''),
        'category' => normalize_german_copy($benefit['category'] ?? ''),
        'fixedAmount' => (float)$benefit['fixed_amount'],
        'payoutMode' => $benefit['payout_mode'],
        'receiptRequired' => (bool)$benefit['receipt_required'],
        'active' => (bool)$benefit['active'],
        'sortOrder' => (int)$benefit['sort_order'],
        'isDefaultAutoAssignment' => (bool)$benefit['is_default_auto_assignment'],
    ];
}

function safe_submission(array $submission): array
{
    return [
        'id' => (string)$submission['id'],
        'employeeId' => (string)$submission['user_id'],
        'benefitYearId' => (string)$submission['benefit_year_id'],
        'status' => $submission['status'],
        'submittedAt' => $submission['submitted_at'],
        'totalSelectedAmount' => (float)$submission['total_selected_amount'],
        'coveredByCompanyAmount' => (float)$submission['covered_by_company_amount'],
        'employeeOwnContributionAmount' => (float)$submission['employee_own_contribution_amount'],
        'remainingBudget' => (float)$submission['remaining_budget'],
        'monthlyPayoutAmount' => (float)$submission['monthly_payout_amount'],
        'adminComment' => $submission['admin_comment'],
        'needsInfoReason' => $submission['needs_info_reason'],
        'hrDecidedBy' => isset($submission['hr_decided_by']) && $submission['hr_decided_by'] !== null ? (string)$submission['hr_decided_by'] : null,
        'hrDecidedAt' => $submission['hr_decided_at'] ?? null,
        'createdAt' => $submission['created_at'],
        'updatedAt' => $submission['updated_at'],
    ];
}

function safe_selected_benefit(array $selected): array
{
    $benefit = null;
    if (!empty($selected['benefit_title'])) {
        $benefit = [
            'id' => (string)$selected['benefit_id'],
            'title' => normalize_german_copy($selected['benefit_title'] ?? ''),
            'description' => normalize_german_copy($selected['benefit_description'] ?? ''),
            'category' => normalize_german_copy($selected['benefit_category'] ?? ''),
            'fixedAmount' => (float)$selected['benefit_fixed_amount'],
            'payoutMode' => $selected['benefit_payout_mode'],
            'receiptRequired' => (bool)$selected['benefit_receipt_required'],
        ];
    }

    return [
        'id' => (string)$selected['id'],
        'submissionId' => (string)$selected['submission_id'],
        'benefitId' => $selected['benefit_id'] ? (string)$selected['benefit_id'] : null,
        'isCustomBenefit' => (bool)$selected['is_custom_benefit'],
        'customTitle' => normalize_german_copy($selected['custom_title'] ?? ''),
        'customDescription' => normalize_german_copy($selected['custom_description'] ?? ''),
        'requestedAmount' => (float)$selected['requested_amount'],
        'coveredAmount' => (float)$selected['covered_amount'],
        'ownContributionAmount' => (float)$selected['own_contribution_amount'],
        'payoutMode' => $selected['payout_mode'],
        'monthlyAmount' => (float)$selected['monthly_amount'],
        'status' => $selected['status'],
        'hrReviewStatus' => $selected['hr_review_status'] ?? 'open',
        'hrReviewNote' => $selected['hr_review_note'] ?? '',
        'hrReviewedBy' => isset($selected['hr_reviewed_by']) && $selected['hr_reviewed_by'] !== null ? (string)$selected['hr_reviewed_by'] : null,
        'hrReviewedAt' => $selected['hr_reviewed_at'] ?? null,
        'benefit' => $benefit,
    ];
}

function safe_attachment(array $attachment): array
{
    return [
        'id' => (string)$attachment['id'],
        'selectedBenefitId' => (string)$attachment['selected_benefit_id'],
        'employeeId' => (string)$attachment['user_id'],
        'fileName' => $attachment['file_name'],
        'fileType' => $attachment['file_type'],
        'fileSize' => isset($attachment['file_size']) ? (int)$attachment['file_size'] : null,
        'uploadedAt' => $attachment['uploaded_at'],
    ];
}

function current_benefit_year(): array
{
    $targetYear = active_process_benefit_year_number();
    $benefitYearId = ensure_benefit_year_record(db(), $targetYear);
    ensure_benefits_for_year(db(), $benefitYearId, $targetYear);

    $stmt = db()->prepare("SELECT * FROM bb_benefit_years WHERE `year` = ? AND status <> 'archived' LIMIT 1");
    $stmt->execute([$targetYear]);
    $year = $stmt->fetch();
    if ($year) {
        return $year;
    }

    $stmt = db()->query("SELECT * FROM bb_benefit_years WHERE status <> 'archived' ORDER BY `year` DESC LIMIT 1");
    $year = $stmt->fetch();
    if ($year) {
        return $year;
    }

    seed_benefit_data(db());
    return current_benefit_year();
}

function get_or_create_submission(int $userId, int $benefitYearId): array
{
    $stmt = db()->prepare('SELECT * FROM bb_submissions WHERE user_id = ? AND benefit_year_id = ? LIMIT 1');
    $stmt->execute([$userId, $benefitYearId]);
    $submission = $stmt->fetch();
    if ($submission) {
        return $submission;
    }

    $year = find_benefit_year_by_id($benefitYearId) ?: current_benefit_year();
    $now = now_sql();
    db()->prepare("
        INSERT INTO bb_submissions (
            user_id, benefit_year_id, status, remaining_budget, created_at, updated_at
        ) VALUES (?, ?, 'draft', ?, ?, ?)
    ")->execute([$userId, $benefitYearId, (float)$year['annual_budget'], $now, $now]);

    return find_submission_by_id((int)db()->lastInsertId());
}

function find_benefit_year_by_id(int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM bb_benefit_years WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $year = $stmt->fetch();
    return $year ?: null;
}

function find_submission_by_id(int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM bb_submissions WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $submission = $stmt->fetch();
    return $submission ?: null;
}

function load_selected_benefits(int $submissionId): array
{
    $stmt = db()->prepare("
        SELECT
            sb.*,
            b.title benefit_title,
            b.description benefit_description,
            b.category benefit_category,
            b.fixed_amount benefit_fixed_amount,
            b.payout_mode benefit_payout_mode,
            b.receipt_required benefit_receipt_required
        FROM bb_selected_benefits sb
        LEFT JOIN bb_benefits b ON b.id = sb.benefit_id
        WHERE sb.submission_id = ?
        ORDER BY sb.id ASC
    ");
    $stmt->execute([$submissionId]);
    return $stmt->fetchAll();
}

function load_attachments_for_user(int $userId): array
{
    $stmt = db()->prepare('
        SELECT id, selected_benefit_id, user_id, file_name, file_path, file_type, file_size, uploaded_at, created_at
        FROM bb_attachments
        WHERE user_id = ?
        ORDER BY uploaded_at DESC
    ');
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

function load_attachments_for_submission(int $submissionId): array
{
    $stmt = db()->prepare("
        SELECT a.id, a.selected_benefit_id, a.user_id, a.file_name, a.file_path, a.file_type, a.file_size, a.uploaded_at, a.created_at
        FROM bb_attachments a
        INNER JOIN bb_selected_benefits sb ON sb.id = a.selected_benefit_id
        WHERE sb.submission_id = ?
        ORDER BY a.uploaded_at DESC
    ");
    $stmt->execute([$submissionId]);
    return $stmt->fetchAll();
}

function recalculate_submission(int $submissionId): array
{
    $submission = find_submission_by_id($submissionId);
    if (!$submission) {
        throw new RuntimeException('submission_not_found');
    }

    $yearStmt = db()->prepare('SELECT * FROM bb_benefit_years WHERE id = ? LIMIT 1');
    $yearStmt->execute([$submission['benefit_year_id']]);
    $year = $yearStmt->fetch();
    $budget = $year ? (float)$year['annual_budget'] : 1000.0;
    $remaining = $budget;
    $total = 0.0;
    $coveredTotal = 0.0;
    $ownTotal = 0.0;
    $monthlyTotal = 0.0;

    $items = load_selected_benefits($submissionId);
    foreach ($items as $item) {
        $amount = max(0.0, (float)$item['requested_amount']);
        $covered = min($remaining, $amount);
        $own = max(0.0, $amount - $covered);
        $monthly = $item['payout_mode'] === 'monthly_12' ? round($covered / 12, 2) : 0.0;
        $remaining = max(0.0, $remaining - $covered);
        $total += $amount;
        $coveredTotal += $covered;
        $ownTotal += $own;
        $monthlyTotal += $monthly;

        db()->prepare("
            UPDATE bb_selected_benefits
            SET covered_amount = ?, own_contribution_amount = ?, monthly_amount = ?, updated_at = ?
            WHERE id = ?
        ")->execute([$covered, $own, $monthly, now_sql(), $item['id']]);
    }

    db()->prepare("
        UPDATE bb_submissions
        SET total_selected_amount = ?, covered_by_company_amount = ?,
            employee_own_contribution_amount = ?, remaining_budget = ?,
            monthly_payout_amount = ?, updated_at = ?
        WHERE id = ?
    ")->execute([$total, $coveredTotal, $ownTotal, $remaining, $monthlyTotal, now_sql(), $submissionId]);

    return find_submission_by_id($submissionId);
}

function submission_budget_exceeded(array $submission, array $year): bool
{
    $annualBudget = (float)($year['annual_budget'] ?? 0);
    $totalSelected = (float)($submission['total_selected_amount'] ?? 0);
    $ownContribution = (float)($submission['employee_own_contribution_amount'] ?? 0);

    return $ownContribution > 0.005 || ($annualBudget > 0 && $totalSelected - $annualBudget > 0.005);
}

function require_budget_available_for_new_benefit(array $submission, array $year): void
{
    if (!submission_budget_exceeded($submission, $year)) {
        return;
    }

    json_response([
        'success' => false,
        'error' => 'Budget überschritten. Entferne zuerst einen Benefit, bevor du ein weiteres auswählst.',
        'errorCode' => 'budget_exceeded',
    ], 409);
}

function utc_datetime(string $value): DateTimeImmutable
{
    return new DateTimeImmutable($value, new DateTimeZone('UTC'));
}

function format_date_de(string $value): string
{
    return utc_datetime($value)->format('d.m.Y');
}

function benefit_year_window_info(array $year, array $submission): array
{
    $schedule = benefit_year_schedule((int)$year['year']);
    $processOpen = utc_datetime(($year['process_open_date'] ?: $schedule['process_open_date']) . ' 00:00:00');
    $submissionDeadline = utc_datetime($year['submission_deadline'] ?: $schedule['submission_deadline']);
    $reminderDate = utc_datetime(($year['reminder_date'] ?: $schedule['reminder_date']) . ' 00:00:00');
    $reviewDeadline = utc_datetime($year['review_deadline'] ?: $schedule['review_deadline']);
    $now = utc_datetime(gmdate('Y-m-d H:i:s'));
    $status = (string)($submission['status'] ?? 'draft');
    $benefitYearNumber = (int)$year['year'];
    $submissionDeadlineText = format_date_de($submissionDeadline->format('Y-m-d H:i:s'));
    $reviewDeadlineText = format_date_de($reviewDeadline->format('Y-m-d H:i:s'));
    $processOpenText = format_date_de($processOpen->format('Y-m-d'));

    $beforeOpen = $now < $processOpen;
    $selectionOpen = $now >= $processOpen && $now <= $submissionDeadline;
    $reviewOpen = $now > $submissionDeadline && $now <= $reviewDeadline;
    $urgent = $selectionOpen && $now >= $reminderDate;
    $editableStatuses = ['draft', 'needs_info', 'rejected'];
    $revisionStatuses = ['needs_info', 'rejected'];
    $canEdit = ($selectionOpen && in_array($status, $editableStatuses, true))
        || ($reviewOpen && in_array($status, $revisionStatuses, true));

    if ($status === 'approved') {
        $phase = 'approved';
        $notice = 'Genehmigt: Deine Benefits für das Benefit-Jahr ' . $benefitYearNumber . ' sind bestätigt und bleiben hier sichtbar.';
    } elseif ($status === 'submitted') {
        $phase = $selectionOpen ? 'submitted' : ($reviewOpen ? 'review' : 'closed');
        $notice = 'Deine Einreichung liegt bei HR. Aktuell wird geprüft, ob alles passt; du musst im Moment nichts weiter tun.';
    } elseif (in_array($status, $revisionStatuses, true) && ($selectionOpen || $reviewOpen)) {
        $phase = $status;
        $notice = 'HR hat eine Rückmeldung hinterlegt. Bitte bearbeite deine Auswahl bis zum ' . ($reviewOpen ? $reviewDeadlineText : $submissionDeadlineText) . ' und reiche sie erneut ein.';
    } elseif ($beforeOpen) {
        $phase = 'before_open';
        $notice = 'Die nächste Benefit-Auswahl ist vorbereitet. Ab dem ' . $processOpenText . ' kannst du hier deine Benefits für das Benefit-Jahr ' . $benefitYearNumber . ' auswählen.';
    } elseif ($urgent) {
        $phase = 'urgent';
        $notice = 'Letzte Woche: Du hast bis zum ' . $submissionDeadlineText . ' Zeit, deine Benefits für das nächste Jahr auszuwählen und final einzureichen.';
    } elseif ($selectionOpen) {
        $phase = 'selection_open';
        $notice = 'Du hast bis zum ' . $submissionDeadlineText . ' Zeit, deine Benefits für das nächste Jahr auszuwählen und final einzureichen.';
    } elseif ($reviewOpen) {
        $phase = 'review';
        $notice = 'Die Auswahlfrist ist vorbei. HR prüft die Einreichungen bis zum ' . $reviewDeadlineText . '; falls eine Rückfrage kommt, kannst du hier nachbessern.';
    } else {
        $phase = 'closed';
        $notice = 'Die Auswahl für das Benefit-Jahr ' . $benefitYearNumber . ' ist abgeschlossen. Genehmigte Benefits bleiben hier sichtbar.';
    }

    return [
        'phase' => $phase,
        'notice' => $notice,
        'processOpenDate' => $processOpen->format('Y-m-d'),
        'submissionDeadline' => $submissionDeadline->format('Y-m-d H:i:s'),
        'reminderDate' => $reminderDate->format('Y-m-d'),
        'reviewDeadline' => $reviewDeadline->format('Y-m-d H:i:s'),
        'isBeforeOpen' => $beforeOpen,
        'isSelectionOpen' => $selectionOpen,
        'isReviewOpen' => $reviewOpen,
        'isUrgent' => $urgent,
        'canEdit' => $canEdit,
        'canSubmit' => $canEdit,
        'canStartNewSubmission' => $selectionOpen,
    ];
}

function benefit_payload_for_user(array $user): array
{
    $year = current_benefit_year();
    $submission = get_or_create_submission((int)$user['id'], (int)$year['id']);
    $submission = recalculate_submission((int)$submission['id']);

    $benefitsStmt = db()->prepare('SELECT * FROM bb_benefits WHERE benefit_year_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC');
    $benefitsStmt->execute([$year['id']]);

    return [
        'success' => true,
        'benefitYear' => safe_benefit_year($year),
        'window' => benefit_year_window_info($year, $submission),
        'submission' => safe_submission($submission),
        'benefits' => array_map('safe_benefit', $benefitsStmt->fetchAll()),
        'selectedBenefits' => array_map('safe_selected_benefit', load_selected_benefits((int)$submission['id'])),
        'attachments' => array_map('safe_attachment', load_attachments_for_user((int)$user['id'])),
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
        'isHr' => (bool)($user['is_hr'] ?? false),
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

function require_user_from_bearer_or_query(): array
{
    $token = bearer_token() ?: (string)($_GET['token'] ?? '');
    $session = verify_session_token($token);
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

function require_hr(): array
{
    $user = require_user();
    if (empty($user['is_hr'])) {
        json_response(['success' => false, 'error' => 'HR-Rechte erforderlich.', 'errorCode' => 'hr_required'], 403);
    }
    return $user;
}

function email_configured(): bool
{
    $transport = mail_transport();

    if ($transport === 'php') {
        return allow_php_mail() && native_mail_available();
    }

    return smtp_config_error() === null;
}

function smtp_configured(): bool
{
    return smtp_config_error() === null;
}

function mail_transport(): string
{
    $transport = strtolower(trim(config_value('MAIL_TRANSPORT')));
    if (in_array($transport, ['smtp', 'php'], true)) {
        return $transport;
    }

    if (smtp_configured()) {
        return 'smtp';
    }

    return allow_php_mail() && native_mail_available() ? 'php' : 'smtp';
}

function smtp_config_error(): ?array
{
    $missing = [];
    foreach (['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'] as $key) {
        if (trim(config_value($key)) === '') {
            $missing[] = $key;
        }
    }

    if ($missing) {
        return [
            'code' => 'email_not_configured',
            'message' => 'SMTP configuration missing: ' . implode(', ', $missing),
        ];
    }

    $portValue = trim(config_value('SMTP_PORT'));
    $port = (int)$portValue;
    if (!ctype_digit($portValue) || $port <= 0 || $port > 65535) {
        return [
            'code' => 'smtp_port_invalid',
            'message' => 'SMTP_PORT must be a valid port number.',
        ];
    }

    $password = config_value('SMTP_PASSWORD');
    foreach (['DAS_PASSWORT_DEINES_HOSTINGER_E_MAIL_KONTOS', 'DEIN_HOSTINGER', 'CHANGE_ME', 'HIER_DAS_ECHTE_PASSWORT'] as $placeholder) {
        if (stripos($password, $placeholder) !== false) {
            return [
                'code' => 'smtp_password_placeholder',
                'message' => 'SMTP_PASSWORD still contains a placeholder. Use the real password of the Hostinger mailbox.',
            ];
        }
    }

    if (!filter_var(config_value('SMTP_USER'), FILTER_VALIDATE_EMAIL)) {
        return [
            'code' => 'smtp_user_invalid',
            'message' => 'SMTP_USER must be the full Hostinger mailbox address.',
        ];
    }

    if (!filter_var(email_address(config_value('SMTP_FROM')), FILTER_VALIDATE_EMAIL)) {
        return [
            'code' => 'smtp_from_invalid',
            'message' => 'SMTP_FROM must contain a valid sender address.',
        ];
    }

    $secure = strtolower(config_value('SMTP_SECURE'));
    if ($secure !== '' && !in_array($secure, ['ssl', 'tls', 'true', 'false', '1', '0'], true)) {
        return [
            'code' => 'smtp_secure_invalid',
            'message' => 'SMTP_SECURE must be ssl, tls, true, false, or empty.',
        ];
    }

    return null;
}

function allow_php_mail(): bool
{
    return filter_var(config_value('ALLOW_PHP_MAIL', 'false'), FILTER_VALIDATE_BOOLEAN);
}

function native_mail_available(): bool
{
    $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
    return function_exists('mail') && !in_array('mail', $disabled, true);
}

function default_email_from(): string
{
    $configured = config_value('SMTP_FROM');
    if ($configured !== '') {
        return normalized_email_from($configured);
    }

    $host = parse_url(config_value('FRONTEND_URL'), PHP_URL_HOST) ?: ($_SERVER['HTTP_HOST'] ?? 'localhost');
    return normalized_email_from('no-reply@' . $host);
}

function php_mail_from(): string
{
    $configured = config_value('PHP_MAIL_FROM');
    if ($configured !== '') {
        return normalized_email_from($configured);
    }

    return default_email_from();
}

function active_mail_from(): string
{
    return mail_transport() === 'php' ? php_mail_from() : default_email_from();
}

function normalized_email_from(string $value): string
{
    $address = email_address($value);
    $currentHost = (string)($_SERVER['HTTP_HOST'] ?? '');

    if (strpos($address, 'hostingersite.com') !== false) {
        $address = 'no-reply@tchibo-benefitbar.at';
    }

    return 'Tchibo Benefitbar <' . $address . '>';
}

function sanitize_email_header(string $value): string
{
    return trim(str_replace(["\r", "\n"], '', $value));
}

function html_to_text(string $html): string
{
    $text = preg_replace('#<(br|/p|/div|/li)\b[^>]*>#i', "\n", $html);
    $text = strip_tags((string)$text);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace("/[ \t]+/", ' ', $text);
    $text = preg_replace("/\n{3,}/", "\n\n", (string)$text);
    return trim((string)$text);
}

function normalize_crlf(string $value): string
{
    return preg_replace("/\r\n|\r|\n/", "\r\n", $value) ?? $value;
}

function smtp_dot_stuff(string $value): string
{
    return preg_replace('/^\./m', '..', $value) ?? $value;
}

function build_email_body(string $html, array $attachments, string &$contentType): string
{
    $text = html_to_text($html);

    if (!$attachments) {
        $boundary = '=_Benefitbar_Alt_' . bin2hex(random_bytes(12));
        $contentType = 'multipart/alternative; boundary="' . $boundary . '"';
        return "--{$boundary}\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . $text . "\r\n"
            . "--{$boundary}\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . $html . "\r\n"
            . "--{$boundary}--\r\n";
    }

    $boundary = '=_Benefitbar_' . bin2hex(random_bytes(12));
    $altBoundary = '=_Benefitbar_Alt_' . bin2hex(random_bytes(12));
    $contentType = 'multipart/mixed; boundary="' . $boundary . '"';
    $body = "--{$boundary}\r\n"
        . "Content-Type: multipart/alternative; boundary=\"{$altBoundary}\"\r\n\r\n"
        . "--{$altBoundary}\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: 8bit\r\n\r\n"
        . $text . "\r\n"
        . "--{$altBoundary}\r\n"
        . "Content-Type: text/html; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: 8bit\r\n\r\n"
        . $html . "\r\n"
        . "--{$altBoundary}--\r\n";

    foreach ($attachments as $attachment) {
        $path = (string)($attachment['path'] ?? '');
        $contents = array_key_exists('content', $attachment) ? (string)$attachment['content'] : null;
        if ($contents === null && $path !== '' && is_file($path) && is_readable($path)) {
            $contents = (string)file_get_contents($path);
        }
        if ($contents === null || $contents === '') {
            continue;
        }

        $filename = sanitize_email_header((string)($attachment['name'] ?? ($path !== '' ? basename($path) : 'nachweis')));
        $mimeType = sanitize_email_header((string)($attachment['type'] ?? 'application/octet-stream'));
        if ($mimeType === '') {
            $mimeType = 'application/octet-stream';
        }

        $body .= "--{$boundary}\r\n"
            . "Content-Type: {$mimeType}; name=\"{$filename}\"\r\n"
            . "Content-Transfer-Encoding: base64\r\n"
            . "Content-Disposition: attachment; filename=\"{$filename}\"\r\n\r\n"
            . chunk_split(base64_encode($contents))
            . "\r\n";
    }

    return $body . "--{$boundary}--\r\n";
}

function send_native_mail(string $recipient, string $subject, string $html, array $attachments = []): string
{
    if (!native_mail_available()) {
        throw new RuntimeException('PHP mail() is not available on this hosting plan');
    }

    $from = php_mail_from();
    $contentType = '';
    $body = build_email_body($html, $attachments, $contentType);
    $headers = [
        'From: ' . $from,
        'Reply-To: ' . email_address($from),
        'MIME-Version: 1.0',
        'Content-Type: ' . $contentType,
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . (parse_url(config_value('FRONTEND_URL'), PHP_URL_HOST) ?: 'tchibo-benefitbar.at') . '>',
        'X-Mailer: PHP/' . phpversion(),
    ];

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $envelopeSender = email_address($from);
    $sent = filter_var($envelopeSender, FILTER_VALIDATE_EMAIL)
        ? mail($recipient, $encodedSubject, $body, implode("\r\n", $headers), '-f' . $envelopeSender)
        : mail($recipient, $encodedSubject, $body, implode("\r\n", $headers));
    if (!$sent) {
        throw new RuntimeException('PHP mail() returned false');
    }

    return 'PHP mail accepted the message for local delivery from ' . email_address($from) . '.';
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

function send_smtp(string $recipient, string $subject, string $html, array $attachments = []): string
{
    $host = config_value('SMTP_HOST');
    $port = (int)config_value('SMTP_PORT');
    $secure = strtolower(config_value('SMTP_SECURE'));
    $from = default_email_from();
    $user = config_value('SMTP_USER');
    $password = config_value('SMTP_PASSWORD');

    $frontendHost = parse_url(config_value('FRONTEND_URL'), PHP_URL_HOST) ?: 'tchibo-benefitbar.at';
    $envelopeSender = filter_var($user, FILTER_VALIDATE_EMAIL) ? $user : email_address($from);
    $remote = ($secure === 'ssl' || $port === 465 ? 'ssl://' : '') . $host . ':' . $port;
    $socket = stream_socket_client($remote, $errno, $errstr, 20, STREAM_CLIENT_CONNECT);
    if (!$socket) {
        throw new RuntimeException("SMTP connection failed: {$errstr}");
    }

    stream_set_timeout($socket, 20);
    smtp_read($socket);
    $ehlo = smtp_command($socket, 'EHLO ' . $frontendHost, [250]);

    if (($secure === 'tls' || (!$secure && stripos($ehlo, 'STARTTLS') !== false)) && $port !== 465) {
        smtp_command($socket, 'STARTTLS', [220]);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('SMTP STARTTLS failed');
        }
        smtp_command($socket, 'EHLO ' . $frontendHost, [250]);
    }

    smtp_command($socket, 'AUTH LOGIN', [334]);
    smtp_command($socket, base64_encode($user), [334]);
    smtp_command($socket, base64_encode($password), [235]);
    smtp_command($socket, 'MAIL FROM:<' . $envelopeSender . '>', [250]);
    smtp_command($socket, 'RCPT TO:<' . $recipient . '>', [250, 251]);
    smtp_command($socket, 'DATA', [354]);

    $contentType = '';
    $body = build_email_body($html, $attachments, $contentType);
    $headers = [
        'From: ' . $from,
        'Sender: ' . $envelopeSender,
        'Reply-To: ' . $envelopeSender,
        'Return-Path: <' . $envelopeSender . '>',
        'To: ' . $recipient,
        'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
        'MIME-Version: 1.0',
        'Content-Type: ' . $contentType,
        'Date: ' . gmdate('r'),
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $frontendHost . '>',
        'Auto-Submitted: auto-generated',
        'X-Auto-Response-Suppress: All',
    ];
    $message = normalize_crlf(implode("\r\n", $headers) . "\r\n\r\n" . $body);
    fwrite($socket, rtrim(smtp_dot_stuff($message), "\r\n") . "\r\n.\r\n");
    $response = smtp_read($socket);
    if ((int)substr($response, 0, 3) !== 250) {
        throw new RuntimeException('SMTP DATA failed: ' . $response);
    }
    smtp_command($socket, 'QUIT', [221, 250]);
    fclose($socket);

    return 'SMTP accepted message: ' . trim(str_replace(["\r", "\n"], ' ', $response));
}

function email_address(string $value): string
{
    if (preg_match('/<([^>]+)>/', $value, $matches)) {
        return trim($matches[1]);
    }
    return trim($value);
}

function send_email(string $recipient, string $subject, string $html, string $type, ?int $userId = null, array $attachments = []): array
{
    if (!email_configured()) {
        $configError = mail_transport() === 'php'
            ? ['code' => 'php_mail_not_available', 'message' => 'PHP mail transport is selected but ALLOW_PHP_MAIL is disabled or mail() is unavailable.']
            : smtp_config_error();
        $message = $configError['message'] ?? 'SMTP configuration missing. PHP mail() fallback is disabled because it cannot guarantee delivery on this hosting plan.';
        $code = $configError['code'] ?? 'email_not_configured';
        log_email($recipient, $subject, $type, 'failed', $message, $userId);
        return ['success' => false, 'code' => $code, 'error' => $message];
    }

    try {
        $transport = mail_transport();
        if ($transport === 'php') {
            $deliveryDetail = send_native_mail($recipient, $subject, $html, $attachments);
        } elseif ($transport === 'smtp') {
            $deliveryDetail = send_smtp($recipient, $subject, $html, $attachments);
        } else {
            throw new RuntimeException('Mail transport is not configured.');
        }
        log_email($recipient, $subject, $type, 'sent', $deliveryDetail, $userId);
        return ['success' => true, 'deliveryDetail' => $deliveryDetail];
    } catch (Throwable $error) {
        log_email($recipient, $subject, $type, 'failed', $error->getMessage(), $userId);
        return ['success' => false, 'code' => classify_email_send_error($error->getMessage()), 'error' => $error->getMessage()];
    }
}

function classify_email_send_error(string $message): string
{
    $lower = strtolower($message);
    if (strpos($lower, 'smtp command failed (535') !== false || strpos($lower, 'authentication') !== false || strpos($lower, 'auth') !== false) {
        return 'smtp_auth_failed';
    }
    if (strpos($lower, 'connection failed') !== false || strpos($lower, 'timed out') !== false || strpos($lower, 'network') !== false) {
        return 'smtp_connection_failed';
    }
    if (strpos($lower, 'starttls') !== false || strpos($lower, 'crypto') !== false || strpos($lower, 'certificate') !== false) {
        return 'smtp_tls_failed';
    }
    return 'email_send_failed';
}

function public_email_failure(array $result): array
{
    $code = (string)($result['code'] ?? 'email_send_failed');
    $configurationCodes = [
        'email_not_configured',
        'smtp_password_placeholder',
        'smtp_user_invalid',
        'smtp_from_invalid',
        'smtp_port_invalid',
        'smtp_secure_invalid',
        'smtp_auth_failed',
        'smtp_connection_failed',
        'smtp_tls_failed',
    ];

    if ($code === 'smtp_auth_failed') {
        return [
            'status' => 503,
            'error' => 'Der E-Mail-Versand ist aktuell nicht korrekt konfiguriert. Die SMTP-Zugangsdaten werden vom Mailserver abgelehnt.',
            'errorCode' => $code,
        ];
    }

    if (in_array($code, $configurationCodes, true)) {
        return [
            'status' => 503,
            'error' => 'Der E-Mail-Versand ist aktuell nicht korrekt konfiguriert. Bitte kontaktiere HR/Prozessmanagement.',
            'errorCode' => $code,
        ];
    }

    return [
        'status' => 500,
        'error' => 'Die Anfrage konnte technisch nicht verarbeitet werden. Bitte später erneut versuchen.',
        'errorCode' => $code,
    ];
}

function activation_email(array $user, string $token): array
{
    $link = rtrim(config_value('FRONTEND_URL'), '/') . '/activate?token=' . urlencode($token);
    $firstName = trim((string)($user['first_name'] ?? ''));
    if ($firstName === '') {
        $localPart = explode('@', (string)$user['email'])[0] ?? '';
        $firstName = explode('.', $localPart)[0] ?: (string)$user['email'];
    }
    $firstName = function_exists('mb_convert_case') ? mb_convert_case($firstName, MB_CASE_TITLE, 'UTF-8') : ucfirst($firstName);
    $name = htmlspecialchars($firstName, ENT_QUOTES, 'UTF-8');
    $linkHtml = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
    $html = "
        <div style=\"font-family:Arial,sans-serif;color:#222222;line-height:1.6;max-width:620px;\">
            <p>Hallo {$name},</p>
            <p>hier ist dein Aktivierungslink fuer die Tchibo Benefitbar. Bitte oeffne diesen Link, um dein Passwort zu setzen:</p>
            <p style=\"margin:18px 0;padding:14px;border:1px solid #D8C894;background:#F7F2E8;border-radius:8px;word-break:break-all;\">
                <a href=\"{$linkHtml}\" style=\"color:#8B7138;text-decoration:underline;font-weight:bold;\">{$linkHtml}</a>
            </p>
            <p>Falls der Link in deinem E-Mail-Programm nicht anklickbar ist, kopiere ihn bitte vollstaendig in die Adresszeile deines Browsers.</p>
            <p>Dieser Link ist nur 24 Stunden gueltig.</p>
            <p>Falls du diesen Link nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>
            <p>Mit freundlichen Gruessen<br>dein Benefitbar-Team</p>
        </div>
    ";
    return send_email($user['email'], 'Aktivierungslink für die Tchibo Benefitbar', $html, 'activation_email', (int)$user['id']);
}

function reset_email(array $user, string $token): array
{
    $link = rtrim(config_value('FRONTEND_URL'), '/') . '/reset-password?token=' . urlencode($token);
    $name = htmlspecialchars($user['first_name'] ?: $user['email'], ENT_QUOTES, 'UTF-8');
    $linkHtml = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
    $html = "
        <div style=\"font-family:Arial,sans-serif;color:#222222;line-height:1.6;max-width:620px;\">
            <p>Hallo {$name},</p>
            <p>du hast eine Anfrage zum Zuruecksetzen deines Passworts gestellt. Bitte oeffne dafuer diesen Link:</p>
            <p style=\"margin:18px 0;padding:14px;border:1px solid #D8C894;background:#F7F2E8;border-radius:8px;word-break:break-all;\">
                <a href=\"{$linkHtml}\" style=\"color:#8B7138;text-decoration:underline;font-weight:bold;\">{$linkHtml}</a>
            </p>
            <p>Falls der Link in deinem E-Mail-Programm nicht anklickbar ist, kopiere ihn bitte vollstaendig in die Adresszeile deines Browsers.</p>
            <p>Der Link ist 24 Stunden gueltig.</p>
        </div>
    ";
    return send_email($user['email'], 'Tchibo Benefitbar - Passwort zurücksetzen', $html, 'password_reset_email', (int)$user['id']);
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

function handle_login(): void
{
    $body = request_json();
    $email = normalize_email($body['email'] ?? '');
    $password = (string)($body['password'] ?? '');

    if (!$email || !$password) {
        json_response(['success' => false, 'error' => 'Bitte E-Mail-Adresse und Passwort eingeben.', 'errorCode' => 'missing_credentials'], 400);
    }
    if (!is_allowed_login_email($email)) {
        log_auth('login_failed', $email, 'failed', 'invalid_domain');
        json_response(['success' => false, 'error' => LOGIN_EMAIL_ERROR_MESSAGE, 'errorCode' => 'invalid_domain'], 400);
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

    $stmt = db()->prepare("UPDATE bb_users SET last_login_at = ?, login_method = 'email_password', updated_at = ? WHERE id = ?");
    $stmt->execute([now_sql(), now_sql(), $user['id']]);
    $user = find_user_by_id((int)$user['id']);

    log_auth('login_successful', $email, 'success');
    json_response([
        'success' => true,
        'message' => 'Anmeldung erfolgreich.',
        'redirectUrl' => '/dashboard',
        'token' => create_session_token($user),
        'user' => ['id' => (string)$user['id'], 'email' => $user['email'], 'isAdmin' => (bool)$user['is_admin'], 'isHr' => (bool)($user['is_hr'] ?? false)],
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
    if (!is_allowed_login_email($email)) {
        json_response(['success' => false, 'error' => LOGIN_EMAIL_ERROR_MESSAGE, 'errorCode' => 'invalid_domain'], 400);
    }

    $user = find_user_by_email($email);
    if (!$user) {
        $namePart = explode('@', $email)[0] ?? '';
        $nameParts = array_values(array_filter(explode('.', $namePart)));
        $firstName = isset($nameParts[0]) ? ucfirst($nameParts[0]) : '';
        $lastName = isset($nameParts[1]) ? ucfirst($nameParts[1]) : '';
        $now = now_sql();

        db()->prepare("
            INSERT INTO bb_users (
                email, first_name, last_name, status, auth_status, password_hash, password_set_at,
                login_method, is_admin, created_at, updated_at
            ) VALUES (?, ?, ?, 'active', 'invited', NULL, NULL, 'email_password', 0, ?, ?)
        ")->execute([$email, $firstName, $lastName, $now, $now]);

        $user = find_user_by_email($email);
        log_auth('access_user_auto_created', $email, 'success');
    }

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
        $failure = public_email_failure($result);
        json_response(['success' => false, 'error' => $failure['error'], 'errorCode' => $failure['errorCode']], $failure['status']);
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
    if (!is_allowed_login_email($email)) {
        json_response(['success' => false, 'error' => LOGIN_EMAIL_ERROR_MESSAGE, 'errorCode' => 'invalid_domain'], 400);
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
        $failure = public_email_failure($result);
        json_response(['success' => false, 'error' => $failure['error'], 'errorCode' => $failure['errorCode']], $failure['status']);
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
        $sql = "UPDATE bb_users SET password_hash = ?, password_set_at = ?, auth_status = 'active', login_method = 'email_password', activation_token_hash = NULL, activation_token_expires_at = NULL, updated_at = ? WHERE id = ?";
    } else {
        $sql = "UPDATE bb_users SET password_hash = ?, password_set_at = ?, auth_status = 'active', login_method = 'email_password', reset_token_hash = NULL, reset_token_expires_at = NULL, updated_at = ? WHERE id = ?";
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

function handle_benefits_overview(): void
{
    $user = require_user();
    json_response(benefit_payload_for_user($user));
}

function ensure_editable_submission(array $submission): void
{
    if (!in_array($submission['status'], ['draft', 'needs_info', 'rejected'], true)) {
        json_response(['success' => false, 'error' => 'Diese Einreichung kann aktuell nicht bearbeitet werden.', 'errorCode' => 'submission_locked'], 409);
    }

    $year = find_benefit_year_by_id((int)$submission['benefit_year_id']);
    if (!$year) {
        json_response(['success' => false, 'error' => 'Benefit-Jahr wurde nicht gefunden.', 'errorCode' => 'benefit_year_not_found'], 404);
    }

    $window = benefit_year_window_info($year, $submission);
    if (empty($window['canEdit'])) {
        json_response(['success' => false, 'error' => $window['notice'], 'errorCode' => 'submission_window_closed', 'window' => $window], 409);
    }
}

function handle_select_benefit(): void
{
    $user = require_user();
    $body = request_json();
    $benefitId = (int)($body['benefitId'] ?? 0);

    $year = current_benefit_year();
    $submission = get_or_create_submission((int)$user['id'], (int)$year['id']);
    ensure_editable_submission($submission);
    $submission = recalculate_submission((int)$submission['id']);

    $benefitStmt = db()->prepare('SELECT * FROM bb_benefits WHERE id = ? AND benefit_year_id = ? AND active = 1 LIMIT 1');
    $benefitStmt->execute([$benefitId, $year['id']]);
    $benefit = $benefitStmt->fetch();
    if (!$benefit) {
        json_response(['success' => false, 'error' => 'Benefit wurde nicht gefunden.', 'errorCode' => 'benefit_not_found'], 404);
    }

    $existsStmt = db()->prepare('SELECT id FROM bb_selected_benefits WHERE submission_id = ? AND benefit_id = ? LIMIT 1');
    $existsStmt->execute([$submission['id'], $benefitId]);
    if ($existsStmt->fetch()) {
        json_response(benefit_payload_for_user($user));
    }

    require_budget_available_for_new_benefit($submission, $year);

    $now = now_sql();
    db()->prepare("
        INSERT INTO bb_selected_benefits (
            submission_id, benefit_id, is_custom_benefit, requested_amount, payout_mode, status, created_at, updated_at
        ) VALUES (?, ?, 0, ?, ?, 'selected', ?, ?)
    ")->execute([$submission['id'], $benefitId, (float)$benefit['fixed_amount'], $benefit['payout_mode'], $now, $now]);

    log_auth('benefit_selected', $user['email'], 'success', null, $benefit['title']);
    json_response(benefit_payload_for_user($user));
}

function handle_add_custom_benefit(): void
{
    $user = require_user();
    $body = request_json();
    $title = trim((string)($body['title'] ?? ''));
    $description = trim((string)($body['description'] ?? ''));
    $amount = (float)($body['amount'] ?? 0);

    if ($title === '' || $amount <= 0) {
        json_response(['success' => false, 'error' => 'Bitte Titel und Betrag angeben.', 'errorCode' => 'invalid_custom_benefit'], 400);
    }

    $year = current_benefit_year();
    if (empty($year['allow_custom_benefits'])) {
        json_response(['success' => false, 'error' => 'Eigene Benefits sind aktuell nicht freigegeben.', 'errorCode' => 'custom_benefits_disabled'], 409);
    }

    $submission = get_or_create_submission((int)$user['id'], (int)$year['id']);
    ensure_editable_submission($submission);
    $submission = recalculate_submission((int)$submission['id']);

    $now = now_sql();
    db()->prepare("
        INSERT INTO bb_selected_benefits (
            submission_id, is_custom_benefit, custom_title, custom_description,
            requested_amount, payout_mode, status, created_at, updated_at
        ) VALUES (?, 1, ?, ?, ?, 'one_time', 'pending_hr_review', ?, ?)
    ")->execute([$submission['id'], $title, $description, $amount, $now, $now]);

    log_auth('custom_benefit_added', $user['email'], 'success', null, $title);
    json_response(benefit_payload_for_user($user));
}

function handle_update_custom_benefit(): void
{
    $user = require_user();
    $body = request_json();
    $selectedBenefitId = (int)($body['selectedBenefitId'] ?? 0);
    $title = trim((string)($body['title'] ?? ''));
    $description = trim((string)($body['description'] ?? ''));
    $amount = (float)($body['amount'] ?? 0);

    if (!$selectedBenefitId || $title === '' || $amount <= 0) {
        json_response(['success' => false, 'error' => 'Bitte Titel und Betrag angeben.', 'errorCode' => 'invalid_custom_benefit'], 400);
    }

    $year = current_benefit_year();
    $submission = get_or_create_submission((int)$user['id'], (int)$year['id']);
    ensure_editable_submission($submission);

    $ownedStmt = db()->prepare('SELECT id FROM bb_selected_benefits WHERE id = ? AND submission_id = ? AND is_custom_benefit = 1 LIMIT 1');
    $ownedStmt->execute([$selectedBenefitId, $submission['id']]);
    if (!$ownedStmt->fetch()) {
        json_response(['success' => false, 'error' => 'Eigener Benefit wurde nicht gefunden.', 'errorCode' => 'custom_benefit_not_found'], 404);
    }

    db()->prepare("
        UPDATE bb_selected_benefits
        SET custom_title = ?, custom_description = ?, requested_amount = ?, updated_at = ?
        WHERE id = ? AND submission_id = ? AND is_custom_benefit = 1
    ")->execute([$title, $description, $amount, now_sql(), $selectedBenefitId, $submission['id']]);

    recalculate_submission((int)$submission['id']);
    log_auth('custom_benefit_updated', $user['email'], 'success', null, $title);
    json_response(benefit_payload_for_user($user));
}

function handle_remove_selected_benefit(): void
{
    $user = require_user();
    $body = request_json();
    $selectedBenefitId = (int)($body['selectedBenefitId'] ?? 0);
    $year = current_benefit_year();
    $submission = get_or_create_submission((int)$user['id'], (int)$year['id']);
    ensure_editable_submission($submission);

    $attachmentsStmt = db()->prepare('SELECT * FROM bb_attachments WHERE selected_benefit_id = ? AND user_id = ?');
    $attachmentsStmt->execute([$selectedBenefitId, $user['id']]);
    foreach ($attachmentsStmt->fetchAll() as $attachment) {
        delete_attachment_file($attachment);
    }
    db()->prepare('DELETE FROM bb_attachments WHERE selected_benefit_id = ? AND user_id = ?')->execute([$selectedBenefitId, $user['id']]);
    db()->prepare('DELETE FROM bb_selected_benefits WHERE id = ? AND submission_id = ?')->execute([$selectedBenefitId, $submission['id']]);
    recalculate_submission((int)$submission['id']);
    json_response(benefit_payload_for_user($user));
}

function attachment_absolute_path(array $attachment): ?string
{
    $relative = str_replace(['\\', "\0"], ['/', ''], (string)($attachment['file_path'] ?? ''));
    $base = realpath(__DIR__ . '/uploads');
    $path = realpath(__DIR__ . '/' . $relative);

    if (!$base || !$path || strpos($path, $base . DIRECTORY_SEPARATOR) !== 0) {
        return null;
    }

    return $path;
}

function attachment_binary_contents(array $attachment): ?string
{
    if (array_key_exists('file_blob', $attachment) && $attachment['file_blob'] !== null && $attachment['file_blob'] !== '') {
        return (string)$attachment['file_blob'];
    }

    $path = attachment_absolute_path($attachment);
    if ($path && is_file($path) && is_readable($path)) {
        $contents = file_get_contents($path);
        return $contents === false ? null : $contents;
    }

    return null;
}

function backfill_attachment_blobs(PDO $pdo): void
{
    try {
        $stmt = $pdo->query("
            SELECT id, file_path
            FROM bb_attachments
            WHERE file_blob IS NULL
              AND file_path IS NOT NULL
              AND file_path <> ''
            LIMIT 100
        ");
        $update = $pdo->prepare('UPDATE bb_attachments SET file_blob = ?, file_size = COALESCE(file_size, ?) WHERE id = ?');
        foreach ($stmt->fetchAll() as $attachment) {
            $contents = attachment_binary_contents($attachment);
            if ($contents === null) {
                continue;
            }
            $update->execute([$contents, strlen($contents), $attachment['id']]);
        }
    } catch (Throwable $error) {
        error_log('Benefitbar attachment backfill failed: ' . $error->getMessage());
    }
}

function delete_attachment_file(array $attachment): void
{
    $path = attachment_absolute_path($attachment);
    if ($path && is_file($path)) {
        @unlink($path);
    }
}

function mime_type_for_attachment(array $attachment): string
{
    $type = trim((string)($attachment['file_type'] ?? ''));
    if ($type !== '') {
        return $type;
    }

    $extension = strtolower(pathinfo((string)($attachment['file_name'] ?? ''), PATHINFO_EXTENSION));
    if ($extension === 'pdf') {
        return 'application/pdf';
    }
    if ($extension === 'jpg' || $extension === 'jpeg') {
        return 'image/jpeg';
    }
    if ($extension === 'png') {
        return 'image/png';
    }
    if ($extension === 'docx') {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    return 'application/octet-stream';
}

function attachment_for_current_user(int $attachmentId, array $user): ?array
{
    $stmt = db()->prepare('SELECT * FROM bb_attachments WHERE id = ? LIMIT 1');
    $stmt->execute([$attachmentId]);
    $attachment = $stmt->fetch();
    if (!$attachment) {
        return null;
    }

    if ((int)$attachment['user_id'] !== (int)$user['id'] && empty($user['is_admin']) && empty($user['is_hr'])) {
        return null;
    }

    return $attachment;
}

function handle_delete_attachment(): void
{
    $user = require_user();
    $body = request_json();
    $attachmentId = (int)($body['attachmentId'] ?? 0);
    if (!$attachmentId) {
        json_response(['success' => false, 'error' => 'Nachweis wurde nicht gefunden.', 'errorCode' => 'attachment_not_found'], 404);
    }

    $year = current_benefit_year();
    $submission = get_or_create_submission((int)$user['id'], (int)$year['id']);
    ensure_editable_submission($submission);

    $stmt = db()->prepare("
        SELECT a.*
        FROM bb_attachments a
        INNER JOIN bb_selected_benefits sb ON sb.id = a.selected_benefit_id
        WHERE a.id = ? AND a.user_id = ? AND sb.submission_id = ?
        LIMIT 1
    ");
    $stmt->execute([$attachmentId, $user['id'], $submission['id']]);
    $attachment = $stmt->fetch();
    if (!$attachment) {
        json_response(['success' => false, 'error' => 'Nachweis wurde nicht gefunden.', 'errorCode' => 'attachment_not_found'], 404);
    }

    delete_attachment_file($attachment);
    db()->prepare('DELETE FROM bb_attachments WHERE id = ? AND user_id = ?')->execute([$attachmentId, $user['id']]);
    json_response(benefit_payload_for_user($user));
}

function handle_attachment_file(): void
{
    $user = require_user_from_bearer_or_query();
    $attachmentId = (int)($_GET['id'] ?? 0);
    $attachment = $attachmentId ? attachment_for_current_user($attachmentId, $user) : null;
    if (!$attachment) {
        json_response(['success' => false, 'error' => 'Nachweis wurde nicht gefunden.', 'errorCode' => 'attachment_not_found'], 404);
    }

    $contents = attachment_binary_contents($attachment);
    if ($contents === null) {
        json_response(['success' => false, 'error' => 'Datei wurde nicht gefunden.', 'errorCode' => 'file_not_found'], 404);
    }

    $filename = str_replace(['"', "\r", "\n"], '', (string)$attachment['file_name']);
    $disposition = !empty($_GET['download']) ? 'attachment' : 'inline';

    header('Content-Type: ' . mime_type_for_attachment($attachment));
    header('Content-Length: ' . strlen($contents));
    header('Content-Disposition: ' . $disposition . '; filename="' . $filename . '"');
    header('Cache-Control: private, max-age=300');
    echo $contents;
    exit;
}

function handle_upload_attachment(): void
{
    $user = require_user();
    $selectedBenefitId = (int)($_POST['selectedBenefitId'] ?? 0);
    if (!$selectedBenefitId || empty($_FILES['file'])) {
        json_response(['success' => false, 'error' => 'Datei fehlt.', 'errorCode' => 'missing_file'], 400);
    }

    $year = current_benefit_year();
    $submission = get_or_create_submission((int)$user['id'], (int)$year['id']);
    ensure_editable_submission($submission);

    $ownedStmt = db()->prepare('SELECT id FROM bb_selected_benefits WHERE id = ? AND submission_id = ? LIMIT 1');
    $ownedStmt->execute([$selectedBenefitId, $submission['id']]);
    if (!$ownedStmt->fetch()) {
        json_response(['success' => false, 'error' => 'Benefit wurde nicht gefunden.', 'errorCode' => 'selected_benefit_not_found'], 404);
    }

    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_response(['success' => false, 'error' => 'Upload fehlgeschlagen.', 'errorCode' => 'upload_failed'], 400);
    }

    $originalName = basename((string)$file['name']);
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowed = ['pdf', 'jpg', 'jpeg', 'png', 'docx'];
    if (!in_array($extension, $allowed, true)) {
        json_response(['success' => false, 'error' => 'Dateityp ist nicht erlaubt.', 'errorCode' => 'invalid_file_type'], 400);
    }

    $contents = file_get_contents((string)$file['tmp_name']);
    if ($contents === false || $contents === '') {
        json_response(['success' => false, 'error' => 'Upload konnte nicht gelesen werden.', 'errorCode' => 'upload_read_failed'], 400);
    }
    $fileSize = strlen($contents);

    $uploadDir = __DIR__ . '/uploads';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }

    $storedName = $user['id'] . '-' . $selectedBenefitId . '-' . bin2hex(random_bytes(8)) . '.' . $extension;
    $target = $uploadDir . '/' . $storedName;
    $filePath = '';
    if (is_dir($uploadDir) && is_writable($uploadDir) && move_uploaded_file($file['tmp_name'], $target)) {
        $filePath = 'uploads/' . $storedName;
    }

    $now = now_sql();
    db()->prepare("
        INSERT INTO bb_attachments (
            selected_benefit_id, user_id, file_name, file_path, file_type, file_blob, file_size, uploaded_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([$selectedBenefitId, $user['id'], $originalName, $filePath, (string)$file['type'], $contents, $fileSize, $now, $now]);

    json_response(benefit_payload_for_user($user));
}

function handle_save_submission_draft(): void
{
    $user = require_user();
    $year = current_benefit_year();
    $submission = get_or_create_submission((int)$user['id'], (int)$year['id']);
    ensure_editable_submission($submission);
    $window = benefit_year_window_info($year, $submission);
    $nextStatus = !empty($window['isReviewOpen']) && in_array($submission['status'], ['needs_info', 'rejected'], true)
        ? $submission['status']
        : 'draft';
    db()->prepare("UPDATE bb_submissions SET status = ?, updated_at = ? WHERE id = ?")->execute([$nextStatus, now_sql(), $submission['id']]);
    json_response(benefit_payload_for_user($user));
}

function handle_submit_submission(): void
{
    $user = require_user();
    $body = request_json();
    $year = current_benefit_year();
    $submission = recalculate_submission((int)get_or_create_submission((int)$user['id'], (int)$year['id'])['id']);
    ensure_editable_submission($submission);

    $selected = load_selected_benefits((int)$submission['id']);
    if (!$selected) {
        json_response(['success' => false, 'error' => 'Bitte wähle mindestens einen Benefit aus.', 'errorCode' => 'no_benefits_selected'], 400);
    }

    if ((float)$submission['employee_own_contribution_amount'] > 0 && empty($body['confirmOwnContribution'])) {
        json_response(['success' => false, 'error' => 'Bitte bestätige den Eigenanteil.', 'errorCode' => 'own_contribution_not_confirmed'], 400);
    }

    $attachments = load_attachments_for_user((int)$user['id']);
    $attachedIds = array_map(function ($attachment) {
        return (int)$attachment['selected_benefit_id'];
    }, $attachments);
    foreach ($selected as $item) {
        if ((!empty($item['benefit_receipt_required']) || !empty($item['is_custom_benefit'])) && !in_array((int)$item['id'], $attachedIds, true)) {
            json_response(['success' => false, 'error' => 'Bitte lade alle erforderlichen Nachweise hoch.', 'errorCode' => 'missing_receipts'], 400);
        }
    }

    if (!email_configured()) {
        json_response(['success' => false, 'error' => 'Der E-Mail-Versand ist aktuell nicht konfiguriert. Bitte kontaktiere HR/Prozessmanagement.', 'errorCode' => 'email_not_configured'], 503);
    }

    db()->prepare("UPDATE bb_submissions SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?")
        ->execute([now_sql(), now_sql(), $submission['id']]);

    $submitted = recalculate_submission((int)$submission['id']);
    $notificationResult = send_submission_notifications($user, $year, $submitted, load_selected_benefits((int)$submission['id']));
    if (!$notificationResult['success']) {
        json_response(['success' => false, 'error' => 'Die Einreichung wurde gespeichert, aber die E-Mail konnte nicht versendet werden. Bitte technische Details im E-Mail-Log prüfen.', 'errorCode' => $notificationResult['code'] ?? 'email_send_failed'], 500);
    }
    log_auth('submission_submitted', $user['email'], 'success');
    json_response(benefit_payload_for_user($user));
}

function handle_withdraw_submission(): void
{
    $user = require_user();
    $year = current_benefit_year();
    $submission = recalculate_submission((int)get_or_create_submission((int)$user['id'], (int)$year['id'])['id']);

    if ($submission['status'] !== 'submitted') {
        json_response([
            'success' => false,
            'error' => 'Nur eingereichte Einreichungen können zurückgezogen werden.',
            'errorCode' => 'submission_not_withdrawable',
        ], 409);
    }

    $window = benefit_year_window_info($year, $submission);
    if (empty($window['isSelectionOpen'])) {
        json_response([
            'success' => false,
            'error' => 'Die Einreichung kann nach Ablauf der Auswahlfrist nicht mehr selbst zurückgezogen werden. Bitte kontaktiere HR/Prozessmanagement.',
            'errorCode' => 'withdraw_window_closed',
            'window' => $window,
        ], 409);
    }

    $pdo = db();
    $now = now_sql();
    $pdo->beginTransaction();
    try {
        $pdo->prepare("
            UPDATE bb_submissions
            SET status = 'draft',
                submitted_at = NULL,
                admin_comment = NULL,
                needs_info_reason = NULL,
                hr_decided_by = NULL,
                hr_decided_at = NULL,
                updated_at = ?
            WHERE id = ?
        ")->execute([$now, $submission['id']]);

        $pdo->prepare("
            UPDATE bb_selected_benefits
            SET hr_review_status = 'open',
                hr_review_note = NULL,
                hr_reviewed_by = NULL,
                hr_reviewed_at = NULL,
                updated_at = ?
            WHERE submission_id = ?
        ")->execute([$now, $submission['id']]);

        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    log_auth('submission_withdrawn', $user['email'], 'success');
    json_response(benefit_payload_for_user($user));
}

function email_attachments_for_submission(int $userId, array $selected): array
{
    $selectedIds = array_values(array_filter(array_map(function ($item) {
        return (int)($item['id'] ?? 0);
    }, $selected)));

    if (!$selectedIds) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($selectedIds), '?'));
    $stmt = db()->prepare("
        SELECT *
        FROM bb_attachments
        WHERE user_id = ? AND selected_benefit_id IN ({$placeholders})
        ORDER BY uploaded_at ASC
    ");
    $stmt->execute(array_merge([$userId], $selectedIds));

    $attachments = [];
    foreach ($stmt->fetchAll() as $attachment) {
        $contents = attachment_binary_contents($attachment);
        if ($contents === null) {
            continue;
        }
        $attachments[] = [
            'content' => $contents,
            'name' => $attachment['file_name'],
            'type' => mime_type_for_attachment($attachment),
        ];
    }

    return $attachments;
}

function send_submission_notifications(array $user, array $year, array $submission, array $selected): array
{
    if (!email_configured()) {
        return ['success' => false, 'code' => 'email_not_configured'];
    }

    $rows = '';
    foreach ($selected as $item) {
        $title = $item['is_custom_benefit'] ? $item['custom_title'] : $item['benefit_title'];
        $rows .= '<li>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . ': ' . number_format((float)$item['requested_amount'], 2, ',', '.') . ' EUR</li>';
    }

    $attachments = email_attachments_for_submission((int)$user['id'], $selected);
    $attachmentList = $attachments
        ? '<p><strong>Anhänge:</strong> ' . count($attachments) . ' Datei(en) wurden dieser E-Mail beigefügt.</p>'
        : '<p><strong>Anhänge:</strong> Keine Nachweise beigefügt.</p>';

    $html = '<p>Eine Benefitbar Einreichung wurde final eingereicht.</p>'
        . '<p><strong>User:</strong> ' . htmlspecialchars($user['email'], ENT_QUOTES, 'UTF-8') . '</p>'
        . '<p><strong>Benefit-Jahr:</strong> ' . (int)$year['year'] . '</p>'
        . '<ul>' . $rows . '</ul>'
        . '<p><strong>Gesamt:</strong> ' . number_format((float)$submission['total_selected_amount'], 2, ',', '.') . ' EUR<br>'
        . '<strong>Unternehmensanteil:</strong> ' . number_format((float)$submission['covered_by_company_amount'], 2, ',', '.') . ' EUR<br>'
        . '<strong>Eigenanteil:</strong> ' . number_format((float)$submission['employee_own_contribution_amount'], 2, ',', '.') . ' EUR</p>'
        . $attachmentList;

    $hrResult = send_email(config_value('HR_NOTIFICATION_EMAIL', 'prozessmanagement@eduscho.at'), 'Benefitbar Einreichung', $html, 'submission_notification', (int)$user['id'], $attachments);
    if (!$hrResult['success']) {
        return $hrResult;
    }
    $userResult = send_email($user['email'], 'Tchibo Benefitbar - Einreichung erhalten', '<p>Deine Einreichung wurde erfolgreich übermittelt und wird geprüft.</p>', 'user_confirmation', (int)$user['id']);
    return $userResult['success'] ? ['success' => true] : $userResult;
}

function available_benefit_year_numbers(): array
{
    $stmt = db()->query('SELECT `year` FROM bb_benefit_years ORDER BY `year` DESC');
    return array_map(function ($row) {
        return (int)$row['year'];
    }, $stmt->fetchAll());
}

function hr_summary_from_row(array $row): array
{
    return [
        'id' => (string)$row['submission_id'],
        'status' => $row['submission_status'],
        'submittedAt' => $row['submitted_at'],
        'updatedAt' => $row['submission_updated_at'],
        'totalSelectedAmount' => (float)$row['total_selected_amount'],
        'coveredByCompanyAmount' => (float)$row['covered_by_company_amount'],
        'employeeOwnContributionAmount' => (float)$row['employee_own_contribution_amount'],
        'selectedCount' => (int)($row['selected_count'] ?? 0),
        'checkedCount' => (int)($row['checked_count'] ?? 0),
        'adminComment' => $row['admin_comment'],
        'needsInfoReason' => $row['needs_info_reason'],
        'employee' => [
            'id' => (string)$row['user_id'],
            'email' => $row['email'],
            'firstName' => $row['first_name'],
            'lastName' => $row['last_name'],
            'status' => $row['user_status'],
            'isAdmin' => (bool)$row['is_admin'],
            'isHr' => (bool)$row['is_hr'],
        ],
        'benefitYear' => [
            'id' => (string)$row['benefit_year_id'],
            'year' => (int)$row['benefit_year'],
        ],
    ];
}

function handle_hr_submissions(): void
{
    require_hr();

    $queue = (string)($_GET['queue'] ?? 'open');
    $year = (string)($_GET['year'] ?? '');
    $status = (string)($_GET['status'] ?? '');
    $search = trim((string)($_GET['q'] ?? ''));
    $where = [];
    $params = [];

    if ($queue !== 'all') {
        $where[] = "s.status IN ('submitted', 'needs_info', 'rejected')";
    }
    if ($status !== '' && $status !== 'all') {
        $allowedStatuses = ['draft', 'submitted', 'needs_info', 'approved', 'rejected'];
        if (!in_array($status, $allowedStatuses, true)) {
            json_response(['success' => false, 'error' => 'Status ist ungültig.', 'errorCode' => 'invalid_status'], 400);
        }
        $where[] = 's.status = ?';
        $params[] = $status;
    }
    if ($year !== '' && $year !== 'all') {
        $where[] = 'byr.`year` = ?';
        $params[] = (int)$year;
    }
    if ($search !== '') {
        $where[] = '(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)';
        $like = '%' . $search . '%';
        array_push($params, $like, $like, $like);
    }

    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $stmt = db()->prepare("
        SELECT
            s.id submission_id,
            s.status submission_status,
            s.submitted_at,
            s.total_selected_amount,
            s.covered_by_company_amount,
            s.employee_own_contribution_amount,
            s.admin_comment,
            s.needs_info_reason,
            s.updated_at submission_updated_at,
            u.id user_id,
            u.email,
            u.first_name,
            u.last_name,
            u.status user_status,
            u.is_admin,
            u.is_hr,
            byr.id benefit_year_id,
            byr.`year` benefit_year,
            COALESCE(stats.selected_count, 0) selected_count,
            COALESCE(stats.checked_count, 0) checked_count
        FROM bb_submissions s
        INNER JOIN bb_users u ON u.id = s.user_id
        INNER JOIN bb_benefit_years byr ON byr.id = s.benefit_year_id
        LEFT JOIN (
            SELECT
                submission_id,
                COUNT(*) selected_count,
                SUM(hr_review_status = 'checked') checked_count
            FROM bb_selected_benefits
            GROUP BY submission_id
        ) stats ON stats.submission_id = s.id
        {$whereSql}
        ORDER BY
            CASE s.status
                WHEN 'submitted' THEN 1
                WHEN 'needs_info' THEN 2
                WHEN 'rejected' THEN 3
                WHEN 'draft' THEN 4
                WHEN 'approved' THEN 5
                ELSE 6
            END,
            s.updated_at DESC
        LIMIT 250
    ");
    $stmt->execute($params);

    json_response([
        'success' => true,
        'years' => available_benefit_year_numbers(),
        'submissions' => array_map('hr_summary_from_row', $stmt->fetchAll()),
    ]);
}

function hr_submission_detail_payload(array $submission): array
{
    $user = find_user_by_id((int)$submission['user_id']);
    $year = find_benefit_year_by_id((int)$submission['benefit_year_id']);
    if (!$user || !$year) {
        throw new RuntimeException('hr_submission_detail_missing_relations');
    }

    $selected = array_map('safe_selected_benefit', load_selected_benefits((int)$submission['id']));
    $attachments = load_attachments_for_submission((int)$submission['id']);
    $attachmentsBySelectedId = [];
    foreach ($attachments as $attachment) {
        $selectedId = (string)$attachment['selected_benefit_id'];
        if (!isset($attachmentsBySelectedId[$selectedId])) {
            $attachmentsBySelectedId[$selectedId] = [];
        }
        $attachmentsBySelectedId[$selectedId][] = safe_attachment($attachment);
    }

    foreach ($selected as &$item) {
        $item['attachments'] = $attachmentsBySelectedId[$item['id']] ?? [];
    }
    unset($item);

    return array_merge(safe_submission(recalculate_submission((int)$submission['id'])), [
        'employee' => safe_user($user),
        'benefitYear' => safe_benefit_year($year),
        'selectedBenefits' => $selected,
    ]);
}

function handle_hr_submission_detail(): void
{
    require_hr();
    $submissionId = (int)($_GET['id'] ?? 0);
    $submission = $submissionId ? find_submission_by_id($submissionId) : null;
    if (!$submission) {
        json_response(['success' => false, 'error' => 'Einreichung wurde nicht gefunden.', 'errorCode' => 'submission_not_found'], 404);
    }

    json_response(['success' => true, 'submission' => hr_submission_detail_payload($submission)]);
}

function selected_benefit_with_submission(int $selectedBenefitId): ?array
{
    $stmt = db()->prepare("
        SELECT sb.*, s.user_id, s.benefit_year_id, s.status submission_status
        FROM bb_selected_benefits sb
        INNER JOIN bb_submissions s ON s.id = sb.submission_id
        WHERE sb.id = ?
        LIMIT 1
    ");
    $stmt->execute([$selectedBenefitId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function handle_hr_selected_benefit_review(): void
{
    $hr = require_hr();
    $body = request_json();
    $selectedBenefitId = (int)($body['selectedBenefitId'] ?? 0);
    $status = (string)($body['status'] ?? 'open');
    $note = trim((string)($body['note'] ?? ''));
    $allowed = ['open', 'checked', 'needs_info', 'rejected'];

    if ($selectedBenefitId <= 0 || !in_array($status, $allowed, true)) {
        json_response(['success' => false, 'error' => 'Prüfstatus ist ungültig.', 'errorCode' => 'invalid_review_status'], 400);
    }

    $selected = selected_benefit_with_submission($selectedBenefitId);
    if (!$selected) {
        json_response(['success' => false, 'error' => 'Benefit wurde nicht gefunden.', 'errorCode' => 'selected_benefit_not_found'], 404);
    }

    db()->prepare("
        UPDATE bb_selected_benefits
        SET hr_review_status = ?, hr_review_note = ?, hr_reviewed_by = ?, hr_reviewed_at = ?, updated_at = ?
        WHERE id = ?
    ")->execute([$status, $note, $hr['id'], now_sql(), now_sql(), $selectedBenefitId]);

    log_auth('hr_selected_benefit_reviewed', $hr['email'], 'success', null, 'selected_benefit_id=' . $selectedBenefitId . ';status=' . $status);
    json_response(['success' => true, 'message' => 'Prüfstatus gespeichert.']);
}

function handle_hr_submission_decision(): void
{
    $hr = require_hr();
    $body = request_json();
    $submissionId = (int)($body['submissionId'] ?? 0);
    $decision = (string)($body['decision'] ?? '');
    $reason = trim((string)($body['reason'] ?? ''));
    $allowed = ['approved', 'needs_info', 'rejected'];

    if ($submissionId <= 0 || !in_array($decision, $allowed, true)) {
        json_response(['success' => false, 'error' => 'Entscheidung ist ungültig.', 'errorCode' => 'invalid_decision'], 400);
    }
    $submission = find_submission_by_id($submissionId);
    if (!$submission) {
        json_response(['success' => false, 'error' => 'Einreichung wurde nicht gefunden.', 'errorCode' => 'submission_not_found'], 404);
    }

    $selected = load_selected_benefits($submissionId);
    if ($decision === 'approved') {
        if (!$selected) {
            json_response(['success' => false, 'error' => 'Eine leere Einreichung kann nicht genehmigt werden.', 'errorCode' => 'empty_submission'], 409);
        }
        foreach ($selected as $item) {
            if (($item['hr_review_status'] ?? 'open') !== 'checked') {
                json_response(['success' => false, 'error' => 'Bitte alle Benefits als erledigt markieren, bevor du genehmigst.', 'errorCode' => 'checklist_incomplete'], 409);
            }
        }
    }

    $optionalReason = $reason !== '' ? $reason : null;
    $adminComment = $decision === 'rejected' ? $optionalReason : ($decision === 'needs_info' ? $optionalReason : null);
    $needsInfoReason = $decision === 'needs_info' ? $optionalReason : ($decision === 'rejected' ? $optionalReason : null);
    db()->prepare("
        UPDATE bb_submissions
        SET status = ?, admin_comment = ?, needs_info_reason = ?,
            hr_decided_by = ?, hr_decided_at = ?, updated_at = ?
        WHERE id = ?
    ")->execute([$decision, $adminComment, $needsInfoReason, $hr['id'], now_sql(), now_sql(), $submissionId]);

    $employee = find_user_by_id((int)$submission['user_id']);
    log_auth('hr_submission_decision', $employee['email'] ?? $hr['email'], 'success', null, 'decision=' . $decision . ';by=' . $hr['email']);
    json_response(['success' => true, 'message' => 'Entscheidung gespeichert.', 'submission' => hr_submission_detail_payload(find_submission_by_id($submissionId))]);
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

    if (!$email || !is_allowed_login_email($email)) {
        json_response(['success' => false, 'error' => LOGIN_EMAIL_ERROR_MESSAGE, 'errorCode' => 'invalid_email'], 400);
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
            login_method, is_admin, is_hr, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, ?, 'email_password', ?, ?, ?, ?)
    ");
    $stmt->execute([
        $email,
        trim((string)($body['firstName'] ?? '')),
        trim((string)($body['lastName'] ?? '')),
        (string)($body['status'] ?? 'active'),
        password_hash($password, PASSWORD_DEFAULT),
        $now,
        !empty($body['isAdmin']) ? 1 : 0,
        !empty($body['isHr']) ? 1 : 0,
        $now,
        $now,
    ]);

    log_auth('admin_user_created', $email, 'success');
    json_response(['success' => true, 'message' => 'User wurde erstellt und kann sich jetzt einloggen.']);
}

function handle_admin_update_user_roles(): void
{
    $admin = require_admin();
    $body = request_json();
    $userId = (int)($body['userId'] ?? $body['id'] ?? 0);
    $isAdmin = !empty($body['isAdmin']) ? 1 : 0;
    $isHr = !empty($body['isHr']) ? 1 : 0;

    if ($userId <= 0) {
        json_response(['success' => false, 'error' => 'User nicht gefunden.', 'errorCode' => 'user_not_found'], 404);
    }
    if ((int)$admin['id'] === $userId && !$isAdmin) {
        json_response(['success' => false, 'error' => 'Du kannst dir deine eigenen Admin-Rechte nicht entziehen.', 'errorCode' => 'cannot_remove_self_admin'], 400);
    }

    $user = find_user_by_id($userId);
    if (!$user) {
        json_response(['success' => false, 'error' => 'User nicht gefunden.', 'errorCode' => 'user_not_found'], 404);
    }

    db()->prepare('UPDATE bb_users SET is_admin = ?, is_hr = ?, updated_at = ? WHERE id = ?')
        ->execute([$isAdmin, $isHr, now_sql(), $userId]);

    $updated = find_user_by_id($userId);
    log_auth('admin_user_roles_changed', $updated['email'], 'success', null, 'changed_by=' . $admin['email']);
    json_response(['success' => true, 'message' => 'Rollen wurden gespeichert.', 'user' => safe_user($updated)]);
}

function handle_admin_update_user_password(): void
{
    $admin = require_admin();
    $body = request_json();
    $userId = (int)($body['userId'] ?? $body['id'] ?? 0);
    $password = (string)($body['password'] ?? '');
    $confirm = (string)($body['passwordConfirm'] ?? $body['confirmPassword'] ?? '');

    if ($userId <= 0) {
        json_response(['success' => false, 'error' => 'User nicht gefunden.', 'errorCode' => 'user_not_found'], 404);
    }
    if (!$password || !$confirm) {
        json_response(['success' => false, 'error' => 'Passwort fehlt.', 'errorCode' => 'missing_password'], 400);
    }
    if ($password !== $confirm) {
        json_response(['success' => false, 'error' => 'Passwörter stimmen nicht überein.', 'errorCode' => 'password_mismatch'], 400);
    }
    $policyError = validate_password_policy($password);
    if ($policyError) {
        json_response(['success' => false, 'error' => $policyError, 'errorCode' => 'invalid_password_policy'], 400);
    }

    $user = find_user_by_id($userId);
    if (!$user) {
        json_response(['success' => false, 'error' => 'User nicht gefunden.', 'errorCode' => 'user_not_found'], 404);
    }

    $now = now_sql();
    db()->prepare("
        UPDATE bb_users
        SET password_hash = ?, password_set_at = ?, auth_status = 'active', login_method = 'email_password', updated_at = ?
        WHERE id = ?
    ")->execute([password_hash($password, PASSWORD_DEFAULT), $now, $now, $userId]);

    log_auth('admin_user_password_changed', $user['email'], 'success', null, 'changed_by=' . $admin['email']);
    json_response(['success' => true, 'message' => 'Passwort wurde geändert.', 'user' => safe_user(find_user_by_id($userId))]);
}

function handle_admin_delete_user(): void
{
    $admin = require_admin();
    $body = request_json();
    $userId = (int)($body['userId'] ?? $body['id'] ?? 0);

    if ($userId <= 0) {
        json_response(['success' => false, 'error' => 'User nicht gefunden.', 'errorCode' => 'user_not_found'], 404);
    }
    if ((int)$admin['id'] === $userId) {
        json_response(['success' => false, 'error' => 'Du kannst deinen eigenen Admin-User nicht löschen.', 'errorCode' => 'cannot_delete_self'], 400);
    }

    $user = find_user_by_id($userId);
    if (!$user) {
        json_response(['success' => false, 'error' => 'User nicht gefunden.', 'errorCode' => 'user_not_found'], 404);
    }

    $pdo = db();
    try {
        $pdo->beginTransaction();
        $pdo->prepare('
            DELETE FROM bb_attachments
            WHERE user_id = ?
               OR selected_benefit_id IN (
                    SELECT sb.id
                    FROM bb_selected_benefits sb
                    INNER JOIN bb_submissions s ON s.id = sb.submission_id
                    WHERE s.user_id = ?
               )
        ')->execute([$userId, $userId]);
        $pdo->prepare('
            DELETE FROM bb_selected_benefits
            WHERE submission_id IN (SELECT id FROM bb_submissions WHERE user_id = ?)
        ')->execute([$userId]);
        $pdo->prepare('DELETE FROM bb_submissions WHERE user_id = ?')->execute([$userId]);
        $pdo->prepare('DELETE FROM bb_users WHERE id = ?')->execute([$userId]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_auth('admin_user_delete_failed', $user['email'], 'failed', 'technical_error', $error->getMessage());
        json_response(['success' => false, 'error' => 'User konnte nicht gelöscht werden.', 'errorCode' => 'delete_failed'], 500);
    }

    log_auth('admin_user_deleted', $user['email'], 'success', null, 'deleted_by=' . $admin['email']);
    json_response(['success' => true, 'message' => 'User wurde gelöscht.']);
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
        'Tchibo Benefitbar - Test-E-Mail',
        '<p>Dies ist eine Test-E-Mail der Tchibo Benefitbar.</p><p>Wenn du diese E-Mail erhalten hast, funktioniert die SMTP-Konfiguration.</p>',
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
        'MAIL_TRANSPORT' => mail_transport(),
        'SMTP_HOST' => config_value('SMTP_HOST') !== '',
        'SMTP_PORT' => config_value('SMTP_PORT') !== '',
        'SMTP_USER' => config_value('SMTP_USER') !== '',
        'SMTP_PASSWORD' => config_value('SMTP_PASSWORD') !== '',
        'SMTP_FROM' => config_value('SMTP_FROM') !== '',
        'SMTP_SECURE' => config_value('SMTP_SECURE') !== '',
        'ALLOW_PHP_MAIL' => allow_php_mail(),
        'PHP_MAIL_FROM' => config_value('PHP_MAIL_FROM') !== '',
        'PHP_MAIL_AVAILABLE' => native_mail_available(),
    ];
    $smtpIssue = smtp_config_error();
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
    $emailLogsStmt = db()->query("
        SELECT created_at createdAt, sent_at sentAt, recipient, subject, email_type emailType, status, error_message errorMessage
        FROM bb_email_log
        ORDER BY created_at DESC
        LIMIT 10
    ");

    json_response([
        'success' => true,
        'databaseConnected' => true,
        'authSystemActive' => config_value('JWT_SECRET') !== '',
        'emailServiceConfigured' => email_configured(),
        'smtp' => $smtp,
        'smtpConfigErrorCode' => $smtpIssue['code'] ?? null,
        'smtpConfigError' => $smtpIssue['message'] ?? null,
        'mailTransport' => mail_transport(),
        'mailFrom' => email_address(active_mail_from()),
        'authProvider' => 'email_password',
        'activeUserCount' => (int)($counts['active_users'] ?? 0),
        'usersWithPassword' => (int)($counts['users_with_password'] ?? 0),
        'usersWithoutPassword' => (int)($counts['users_without_password'] ?? 0),
        'recentLoginErrors' => $loginErrorsStmt->fetchAll(),
        'recentEmailErrors' => $emailErrorsStmt->fetchAll(),
        'recentEmailLogs' => $emailLogsStmt->fetchAll(),
    ]);
}

try {
    $path = route_path();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET' && ($path === '/health' || $path === '/')) {
        $databaseConfigured = database_config_present();
        $databaseConnected = false;
        $databaseError = null;

        if ($databaseConfigured) {
            try {
                db()->query('SELECT 1');
                $databaseConnected = true;
            } catch (Throwable $databaseException) {
                $databaseError = $databaseException->getMessage();
            }
        }

        json_response([
            'status' => 'ok',
            'runtime' => 'php',
            'apiVersion' => BENEFITBAR_API_VERSION,
            'databaseConfigured' => $databaseConfigured,
            'databaseConnected' => $databaseConnected,
            'databaseError' => $databaseError,
            'diagnostics' => benefitbar_config_diagnostics(),
        ]);
    }

    migrate();

    if ($method === 'GET' && $path === '/auth/me') {
        $user = require_user();
        json_response([
            'success' => true,
            'user' => ['id' => (string)$user['id'], 'email' => $user['email'], 'isAdmin' => (bool)$user['is_admin'], 'isHr' => (bool)($user['is_hr'] ?? false)],
            'employee' => safe_user($user),
        ]);
    }
    if ($method === 'POST' && $path === '/auth/login') handle_login();
    if ($method === 'POST' && $path === '/auth/request-access') handle_request_access();
    if ($method === 'POST' && $path === '/auth/forgot-password') handle_forgot_password();
    if ($method === 'POST' && $path === '/auth/activate') handle_set_password('activation');
    if ($method === 'POST' && $path === '/auth/reset-password') handle_set_password('reset');
    if ($method === 'GET' && $path === '/auth/validate-token') handle_validate_token();
    if ($method === 'GET' && $path === '/benefits/overview') handle_benefits_overview();
    if ($method === 'POST' && $path === '/benefits/select') handle_select_benefit();
    if ($method === 'POST' && $path === '/benefits/custom') handle_add_custom_benefit();
    if ($method === 'POST' && $path === '/benefits/custom/update') handle_update_custom_benefit();
    if ($method === 'POST' && $path === '/benefits/remove') handle_remove_selected_benefit();
    if ($method === 'GET' && $path === '/attachments/file') handle_attachment_file();
    if ($method === 'POST' && $path === '/attachments/upload') handle_upload_attachment();
    if ($method === 'POST' && $path === '/attachments/delete') handle_delete_attachment();
    if ($method === 'POST' && $path === '/submission/save-draft') handle_save_submission_draft();
    if ($method === 'POST' && $path === '/submission/submit') handle_submit_submission();
    if ($method === 'POST' && $path === '/submission/withdraw') handle_withdraw_submission();
    if ($method === 'GET' && $path === '/hr/submissions') handle_hr_submissions();
    if ($method === 'GET' && $path === '/hr/submissions/detail') handle_hr_submission_detail();
    if ($method === 'POST' && $path === '/hr/selected-benefit/review') handle_hr_selected_benefit_review();
    if ($method === 'POST' && $path === '/hr/submissions/decision') handle_hr_submission_decision();

    if ($method === 'GET' && $path === '/admin/users') {
        require_admin();
        $stmt = db()->query('SELECT * FROM bb_users ORDER BY created_at DESC');
        json_response(['success' => true, 'users' => array_map('safe_user', $stmt->fetchAll())]);
    }
    if ($method === 'POST' && $path === '/admin/create-user') handle_admin_create_user();
    if ($method === 'POST' && $path === '/admin/update-user-roles') handle_admin_update_user_roles();
    if ($method === 'POST' && $path === '/admin/update-user-password') handle_admin_update_user_password();
    if ($method === 'POST' && $path === '/admin/delete-user') handle_admin_delete_user();
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
                'error' => 'Technischer Fehler. Bitte später erneut versuchen.',
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
