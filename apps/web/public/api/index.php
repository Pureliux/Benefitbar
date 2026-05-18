<?php

declare(strict_types=1);

require __DIR__ . '/config.php';

const BENEFITBAR_API_VERSION = '2026-05-18-bootstrap-admin-v11';

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
            uploaded_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL,
            INDEX idx_attachment_selected (selected_benefit_id),
            INDEX idx_attachment_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    seed_benefit_data($pdo);
    bootstrap_admin();
}

function seed_benefit_data(PDO $pdo): void
{
    $year = (int)gmdate('Y');
    $now = now_sql();

    $stmt = $pdo->prepare('SELECT * FROM bb_benefit_years WHERE year = ? LIMIT 1');
    $stmt->execute([$year]);
    $benefitYear = $stmt->fetch();

    if (!$benefitYear) {
        $deadline = sprintf('%d-10-31 23:59:00', $year);
        $pdo->prepare("
            INSERT INTO bb_benefit_years (
                year, annual_budget, process_open_date, submission_deadline, status,
                allow_custom_benefits, created_at, updated_at
            ) VALUES (?, 1000.00, ?, ?, 'open', 1, ?, ?)
        ")->execute([$year, $year . '-01-01', $deadline, $now, $now]);
        $benefitYearId = (int)$pdo->lastInsertId();
    } else {
        $benefitYearId = (int)$benefitYear['id'];
    }

    $countStmt = $pdo->prepare('SELECT COUNT(*) count FROM bb_benefits WHERE benefit_year_id = ?');
    $countStmt->execute([$benefitYearId]);
    if ((int)($countStmt->fetch()['count'] ?? 0) > 0) {
        normalize_seed_benefit_copy($pdo, $benefitYearId);
        return;
    }

    $benefits = [
        ['Yoga-Kurs', 'Kurse für Bewegung, Achtsamkeit und mentale Gesundheit.', 'Gesundheit', 200, 'one_time', 1, 10, 0],
        ['Wiener Öffi-Ticket', 'Zuschuss für öffentliche Verkehrsmittel und nachhaltige Mobilität.', 'Mobilität', 460, 'monthly_12', 1, 20, 1],
        ['Fitness-Zuschuss', 'Mitgliedschaft, Kurse oder Trainingsangebote für deine Fitness.', 'Fitness', 300, 'one_time', 1, 30, 0],
        ['Weiterbildung', 'Seminare, Kurse oder Fachliteratur für deine berufliche Entwicklung.', 'Weiterbildung', 500, 'one_time', 1, 40, 0],
        ['Gesundheitscheck', 'Vorsorge, Beratung oder anerkannte Gesundheitsleistungen.', 'Gesundheit', 250, 'one_time', 1, 50, 0],
        ['Homeoffice-Ausstattung', 'Arbeitsmittel für einen guten Arbeitsplatz zuhause.', 'Arbeitsplatz', 350, 'one_time', 1, 60, 0],
        ['Essens-/Verpflegungszuschuss', 'Unterstützung für Mahlzeiten und gesunde Ernährung.', 'Ernährung', 600, 'monthly_12', 1, 70, 1],
    ];

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
            $updates['last_name'] = config_value('BOOTSTRAP_ADMIN_LAST_NAME', 'Benefit-Bar');
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
        'uploadedAt' => $attachment['uploaded_at'],
    ];
}

function current_benefit_year(): array
{
    $stmt = db()->query("SELECT * FROM bb_benefit_years WHERE status = 'open' ORDER BY year DESC LIMIT 1");
    $year = $stmt->fetch();
    if ($year) {
        return $year;
    }

    $stmt = db()->query("SELECT * FROM bb_benefit_years ORDER BY year DESC LIMIT 1");
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

    $year = current_benefit_year();
    $now = now_sql();
    db()->prepare("
        INSERT INTO bb_submissions (
            user_id, benefit_year_id, status, remaining_budget, created_at, updated_at
        ) VALUES (?, ?, 'draft', ?, ?, ?)
    ")->execute([$userId, $benefitYearId, (float)$year['annual_budget'], $now, $now]);

    return find_submission_by_id((int)db()->lastInsertId());
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
    $stmt = db()->prepare('SELECT * FROM bb_attachments WHERE user_id = ? ORDER BY uploaded_at DESC');
    $stmt->execute([$userId]);
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

function benefit_payload_for_user(array $user): array
{
    $year = current_benefit_year();
    $submission = get_or_create_submission((int)$user['id'], (int)$year['id']);

    $benefitsStmt = db()->prepare('SELECT * FROM bb_benefits WHERE benefit_year_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC');
    $benefitsStmt->execute([$year['id']]);

    return [
        'success' => true,
        'benefitYear' => safe_benefit_year($year),
        'submission' => safe_submission(recalculate_submission((int)$submission['id'])),
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

function email_configured(): bool
{
    return smtp_configured() || native_mail_available();
}

function smtp_configured(): bool
{
    return config_value('SMTP_HOST') && config_value('SMTP_PORT') && config_value('SMTP_USER') && config_value('SMTP_PASSWORD') && config_value('SMTP_FROM');
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

function normalized_email_from(string $value): string
{
    $address = email_address($value);
    $currentHost = (string)($_SERVER['HTTP_HOST'] ?? '');

    if (strpos($address, 'hostingersite.com') !== false) {
        $address = 'no-reply@tchibo-benefitbar.at';
    }

    return 'Tchibo Benefitbar <' . $address . '>';
}

function send_native_mail(string $recipient, string $subject, string $html): void
{
    if (!native_mail_available()) {
        throw new RuntimeException('PHP mail() is not available on this hosting plan');
    }

    $from = default_email_from();
    $headers = [
        'From: ' . $from,
        'Reply-To: ' . email_address($from),
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'X-Mailer: PHP/' . phpversion(),
    ];

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $sent = mail($recipient, $encodedSubject, $html, implode("\r\n", $headers));
    if (!$sent) {
        throw new RuntimeException('PHP mail() returned false');
    }
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
        $message = 'No SMTP configuration and PHP mail() is not available';
        log_email($recipient, $subject, $type, 'failed', $message, $userId);
        return ['success' => false, 'code' => 'email_not_configured', 'error' => $message];
    }

    try {
        if (smtp_configured()) {
            send_smtp($recipient, $subject, $html);
        } else {
            send_native_mail($recipient, $subject, $html);
        }
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
            <p>hier ist dein Aktivierungslink für die Tchibo Benefit Bar, über den du dein Passwort setzen kannst.</p>
            <p style=\"margin:24px 0;\">
                <a href=\"{$linkHtml}\" style=\"display:inline-block;background:#C0A468;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px;\">Passwort setzen</a>
            </p>
            <p style=\"word-break:break-all;\"><a href=\"{$linkHtml}\" style=\"color:#8B7138;\">{$linkHtml}</a></p>
            <p>Dieser Link ist nur 24 Stunden gültig.</p>
            <p>Falls du diesen Link nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>
            <p>Mit freundlichen Grüßen<br>dein Benefit Bar Team</p>
        </div>
    ";
    return send_email($user['email'], 'Aktivierungslink für die Tchibo Benefit Bar', $html, 'activation_email', (int)$user['id']);
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

    $stmt = db()->prepare("UPDATE bb_users SET last_login_at = ?, login_method = 'email_password', updated_at = ? WHERE id = ?");
    $stmt->execute([now_sql(), now_sql(), $user['id']]);
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
    if (!in_array($submission['status'], ['draft', 'needs_info'], true)) {
        json_response(['success' => false, 'error' => 'Diese Einreichung kann aktuell nicht bearbeitet werden.', 'errorCode' => 'submission_locked'], 409);
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

    if ((int)$attachment['user_id'] !== (int)$user['id'] && empty($user['is_admin'])) {
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

    $path = attachment_absolute_path($attachment);
    if (!$path || !is_file($path)) {
        json_response(['success' => false, 'error' => 'Datei wurde nicht gefunden.', 'errorCode' => 'file_not_found'], 404);
    }

    $filename = str_replace(['"', "\r", "\n"], '', (string)$attachment['file_name']);
    $disposition = !empty($_GET['download']) ? 'attachment' : 'inline';

    header('Content-Type: ' . mime_type_for_attachment($attachment));
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: ' . $disposition . '; filename="' . $filename . '"');
    header('Cache-Control: private, max-age=300');
    readfile($path);
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

    $uploadDir = __DIR__ . '/uploads';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $storedName = $user['id'] . '-' . $selectedBenefitId . '-' . bin2hex(random_bytes(8)) . '.' . $extension;
    $target = $uploadDir . '/' . $storedName;
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        json_response(['success' => false, 'error' => 'Upload konnte nicht gespeichert werden.', 'errorCode' => 'upload_store_failed'], 500);
    }

    $now = now_sql();
    db()->prepare("
        INSERT INTO bb_attachments (
            selected_benefit_id, user_id, file_name, file_path, file_type, uploaded_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ")->execute([$selectedBenefitId, $user['id'], $originalName, 'uploads/' . $storedName, (string)$file['type'], $now, $now]);

    json_response(benefit_payload_for_user($user));
}

function handle_save_submission_draft(): void
{
    $user = require_user();
    $year = current_benefit_year();
    $submission = get_or_create_submission((int)$user['id'], (int)$year['id']);
    ensure_editable_submission($submission);
    db()->prepare("UPDATE bb_submissions SET status = 'draft', updated_at = ? WHERE id = ?")->execute([now_sql(), $submission['id']]);
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

    db()->prepare("UPDATE bb_submissions SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?")
        ->execute([now_sql(), now_sql(), $submission['id']]);

    $submitted = recalculate_submission((int)$submission['id']);
    send_submission_notifications($user, $year, $submitted, load_selected_benefits((int)$submission['id']));
    log_auth('submission_submitted', $user['email'], 'success');
    json_response(benefit_payload_for_user($user));
}

function send_submission_notifications(array $user, array $year, array $submission, array $selected): void
{
    if (!email_configured()) {
        return;
    }

    $rows = '';
    foreach ($selected as $item) {
        $title = $item['is_custom_benefit'] ? $item['custom_title'] : $item['benefit_title'];
        $rows .= '<li>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . ': ' . number_format((float)$item['requested_amount'], 2, ',', '.') . ' EUR</li>';
    }

    $html = '<p>Eine Benefit-Bar Einreichung wurde final eingereicht.</p>'
        . '<p><strong>User:</strong> ' . htmlspecialchars($user['email'], ENT_QUOTES, 'UTF-8') . '</p>'
        . '<p><strong>Benefit-Jahr:</strong> ' . (int)$year['year'] . '</p>'
        . '<ul>' . $rows . '</ul>'
        . '<p><strong>Gesamt:</strong> ' . number_format((float)$submission['total_selected_amount'], 2, ',', '.') . ' EUR<br>'
        . '<strong>Unternehmensanteil:</strong> ' . number_format((float)$submission['covered_by_company_amount'], 2, ',', '.') . ' EUR<br>'
        . '<strong>Eigenanteil:</strong> ' . number_format((float)$submission['employee_own_contribution_amount'], 2, ',', '.') . ' EUR</p>';

    send_email(config_value('HR_NOTIFICATION_EMAIL', 'prozessmanagement@eduscho.at'), 'Benefit-Bar Einreichung', $html, 'submission_notification', (int)$user['id']);
    send_email($user['email'], 'Tchibo Benefit-Bar - Einreichung erhalten', '<p>Deine Einreichung wurde erfolgreich übermittelt und wird geprüft.</p>', 'user_confirmation', (int)$user['id']);
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
        'authProvider' => 'email_password',
        'activeUserCount' => (int)($counts['active_users'] ?? 0),
        'usersWithPassword' => (int)($counts['users_with_password'] ?? 0),
        'usersWithoutPassword' => (int)($counts['users_without_password'] ?? 0),
        'recentLoginErrors' => $loginErrorsStmt->fetchAll(),
        'recentEmailErrors' => $emailErrorsStmt->fetchAll(),
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

    if ($method === 'GET' && $path === '/admin/users') {
        require_admin();
        $stmt = db()->query('SELECT * FROM bb_users ORDER BY created_at DESC');
        json_response(['success' => true, 'users' => array_map('safe_user', $stmt->fetchAll())]);
    }
    if ($method === 'POST' && $path === '/admin/create-user') handle_admin_create_user();
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
