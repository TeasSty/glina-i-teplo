<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

function json_response(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function clean_text($value, int $maxLength): string
{
    if (!is_string($value)) {
        return '';
    }

    $value = trim(strip_tags($value));
    $value = preg_replace('/[ \t]+/u', ' ', $value) ?? '';
    $value = preg_replace('/\R{3,}/u', "\n\n", $value) ?? '';
    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);

    if ($length > $maxLength) {
        return '';
    }

    return $value;
}

function encoded_header(string $value): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($value, 'UTF-8', 'B', "\r\n");
    }

    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

$configPath = __DIR__ . '/config.php';
$config = is_file($configPath) ? require $configPath : null;
$configReady =
    is_array($config)
    && filter_var($config['recipient_email'] ?? '', FILTER_VALIDATE_EMAIL)
    && filter_var($config['from_email'] ?? '', FILTER_VALIDATE_EMAIL);

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['health'])) {
    if (!$configReady || !is_callable('mail')) {
        json_response(503, [
            'ok' => false,
            'backend' => 'php-mail',
            'message' => 'Форма ещё не настроена на сервере.',
        ]);
    }

    json_response(200, ['ok' => true, 'backend' => 'php-mail']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    json_response(405, ['ok' => false, 'message' => 'Метод запроса не поддерживается.']);
}

if (!$configReady || !is_callable('mail')) {
    json_response(503, [
        'ok' => false,
        'message' => 'Отправка временно недоступна. Напишите студии в VK или позвоните.',
    ]);
}

$contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
if ($contentLength > 16384) {
    json_response(413, ['ok' => false, 'message' => 'Заявка получилась слишком большой.']);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
if ($origin !== '') {
    $originHost = strtolower((string) parse_url($origin, PHP_URL_HOST));
    $allowedOrigins = is_array($config['allowed_origins'] ?? null) ? $config['allowed_origins'] : [];
    $originAllowed = $originHost === preg_replace('/:\d+$/', '', $host);

    foreach ($allowedOrigins as $allowedOrigin) {
        if (is_string($allowedOrigin) && rtrim($allowedOrigin, '/') === rtrim($origin, '/')) {
            $originAllowed = true;
            break;
        }
    }

    if (!$originAllowed) {
        json_response(403, ['ok' => false, 'message' => 'Источник запроса не разрешён.']);
    }
}

$honeypot = clean_text($_POST['website'] ?? '', 120);
if ($honeypot !== '') {
    json_response(200, ['ok' => true, 'message' => 'Заявка отправлена.']);
}

$name = clean_text($_POST['name'] ?? '', 80);
$phone = clean_text($_POST['phone'] ?? '', 40);
$format = clean_text($_POST['format'] ?? '', 120);
$date = clean_text($_POST['date'] ?? '', 10);
$guests = clean_text($_POST['guests'] ?? '', 2);
$comment = clean_text($_POST['comment'] ?? '', 1200);
$consent = clean_text($_POST['consent'] ?? '', 8);

$errors = [];
if ($name === '' || preg_match('/[\r\n]/', $name)) {
    $errors['name'] = 'Укажите имя.';
}

$phoneDigits = preg_replace('/\D+/', '', $phone) ?? '';
if ($phone === '' || strlen($phoneDigits) < 10 || strlen($phoneDigits) > 15) {
    $errors['phone'] = 'Укажите корректный телефон.';
}

if ($format === '') {
    $errors['format'] = 'Выберите формат занятия.';
}

if ($date !== '') {
    $dateObject = DateTime::createFromFormat('Y-m-d', $date);
    if (!$dateObject || $dateObject->format('Y-m-d') !== $date) {
        $errors['date'] = 'Укажите корректную дату.';
    }
}

if ($guests !== '' && (!ctype_digit($guests) || (int) $guests < 1 || (int) $guests > 32)) {
    $errors['guests'] = 'Количество гостей должно быть от 1 до 32.';
}

if ($consent !== 'yes') {
    $errors['consent'] = 'Нужно согласие на обработку данных.';
}

if ($errors !== []) {
    json_response(422, [
        'ok' => false,
        'message' => 'Проверьте заполненные поля.',
        'errors' => $errors,
    ]);
}

$remoteAddress = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$rateFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
    . DIRECTORY_SEPARATOR
    . 'glina-teplo-' . hash('sha256', $remoteAddress) . '.rate';
$now = time();
$lastRequest = is_file($rateFile) ? (int) file_get_contents($rateFile) : 0;

if ($lastRequest > 0 && ($now - $lastRequest) < 30) {
    json_response(429, [
        'ok' => false,
        'message' => 'Пожалуйста, подождите немного перед повторной отправкой.',
    ]);
}

if (file_put_contents($rateFile, (string) $now, LOCK_EX) === false) {
    error_log('Glina i Teplo contact form: could not update the rate-limit file.');
}

$lines = [
    'Новая заявка с сайта «Глина и Тепло»',
    '',
    'Имя: ' . $name,
    'Телефон: ' . $phone,
    'Формат: ' . $format,
    'Дата: ' . ($date !== '' ? $date : 'не указана'),
    'Количество гостей: ' . ($guests !== '' ? $guests : 'не указано'),
    'Комментарий: ' . ($comment !== '' ? $comment : 'нет'),
    '',
    'IP: ' . $remoteAddress,
    'Время: ' . date('c'),
];

$fromName = clean_text($config['from_name'] ?? 'Сайт Глина и Тепло', 80);
$subjectPrefix = clean_text($config['subject_prefix'] ?? '[Глина и Тепло]', 60);
$subject = encoded_header($subjectPrefix . ' Новая заявка: ' . $format);
$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'From: ' . encoded_header($fromName) . ' <' . $config['from_email'] . '>',
];

$sent = mail(
    $config['recipient_email'],
    $subject,
    implode("\r\n", $lines),
    implode("\r\n", $headers)
);

if (!$sent) {
    error_log('Glina i Teplo contact form: mail() returned false.');
    json_response(500, [
        'ok' => false,
        'message' => 'Письмо не отправилось. Напишите студии в VK или позвоните.',
    ]);
}

json_response(200, [
    'ok' => true,
    'message' => 'Заявка отправлена. Администратор свяжется с вами.',
]);
