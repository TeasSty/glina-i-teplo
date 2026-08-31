<?php

/**
 * Скопируйте файл как config.php и заполните адреса доменной почты.
 * config.php игнорируется Git и не должен попадать в публичный репозиторий.
 */
return [
    'recipient_email' => 'owner@example.ru',
    'from_email' => 'site@example.ru',
    'from_name' => 'Сайт Глина и Тепло',
    'subject_prefix' => '[Глина и Тепло]',
    'allowed_origins' => [
        'https://example.ru',
        'https://www.example.ru',
    ],
];
