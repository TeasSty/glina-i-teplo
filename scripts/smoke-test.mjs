import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.TEST_URL || 'http://localhost:4321';
const browser = await chromium.launch({ headless: true });
const failures = [];
const consoleErrors = [];

await mkdir('artifacts', { recursive: true });

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
desktop.on('console', (message) => {
	if (message.type() === 'error') consoleErrors.push(message.text());
});
desktop.on('pageerror', (error) => consoleErrors.push(error.message));

await desktop.goto(baseUrl, { waitUntil: 'networkidle' });
for (let index = 0; index < (await desktop.locator('img').count()); index += 1) {
	await desktop.locator('img').nth(index).scrollIntoViewIfNeeded();
}
await desktop.waitForTimeout(500);
await desktop.evaluate(() => window.scrollTo(0, 0));
await desktop.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });

if (!(await desktop.locator('.hero-copy h1').textContent())?.includes('Слепите вещь')) {
	failures.push('Главный H1 не найден.');
}

const brokenImages = await desktop.locator('img').evaluateAll((images) =>
	images.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src),
);
if (brokenImages.length > 0) failures.push(`Не загрузились изображения: ${brokenImages.join(', ')}`);

const desktopOverflow = await desktop.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (desktopOverflow) failures.push('Есть горизонтальный скролл на desktop.');

await desktop.locator('[data-format="together"]').click();
if (!(await desktop.locator('[data-format-panel="together"]').evaluate((element) => element.classList.contains('is-active')))) {
	failures.push('Переключатель форматов не активирует нужное изображение.');
}

for (const path of ['master-klassy/', 'events/', 'course/', 'certificate/', 'contacts/', 'privacy/']) {
	const response = await desktop.goto(new URL(path, `${baseUrl}/`).href, { waitUntil: 'networkidle' });
	if (!response?.ok()) failures.push(`Страница ${path} вернула ${response?.status()}.`);
}

await desktop.goto(new URL('contacts/', `${baseUrl}/`).href, { waitUntil: 'networkidle' });
await desktop.locator('[data-submit-button]').waitFor();
await desktop.waitForFunction(() => {
	const button = document.querySelector('[data-submit-button]');
	return button && button.textContent !== 'Проверяем возможность отправки…';
});

const fallbackButtonLabel = await desktop.locator('[data-submit-button]').textContent();
if (fallbackButtonLabel !== 'Скопировать и открыть VK') {
	failures.push('Локальная версия не включила честный VK fallback.');
}

await desktop.locator('input[name="name"]').fill('Анна');
await desktop.locator('input[name="phone"]').fill('+7 999 123-45-67');
await desktop.locator('select[name="format"]').selectOption({ label: 'Свидание' });
await desktop.locator('input[name="guests"]').fill('2');
const message = await desktop.locator('[data-message-preview]').inputValue();
if (!message.includes('Анна') || !message.includes('Свидание') || !message.includes('+7 999 123-45-67')) {
	failures.push('Конструктор заявки не сформировал полное сообщение.');
}
await desktop.screenshot({ path: 'artifacts/contacts-desktop.png', fullPage: true });

const mobile = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
mobile.on('console', (message) => {
	if (message.type() === 'error') consoleErrors.push(message.text());
});
mobile.on('pageerror', (error) => consoleErrors.push(error.message));
await mobile.goto(baseUrl, { waitUntil: 'networkidle' });

const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (mobileOverflow) failures.push('Есть горизонтальный скролл на ширине 375 px.');

await mobile.locator('.menu-toggle').click();
if ((await mobile.locator('.menu-toggle').getAttribute('aria-expanded')) !== 'true') {
	failures.push('Мобильное меню не открылось.');
}
await mobile.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });

const narrow = await browser.newPage({ viewport: { width: 320, height: 720 }, deviceScaleFactor: 1 });
await narrow.goto(baseUrl, { waitUntil: 'networkidle' });
const narrowOverflow = await narrow.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (narrowOverflow) {
	const offenders = await narrow.evaluate(() =>
		[...document.querySelectorAll('*')]
			.filter((element) => {
				const rect = element.getBoundingClientRect();
				return rect.right > window.innerWidth + 1 || rect.left < -1;
			})
			.slice(0, 10)
			.map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
	);
	failures.push(`Есть горизонтальный скролл на ширине 320 px: ${offenders.join(', ')}`);
}
await narrow.screenshot({ path: 'artifacts/home-320.png' });

if (consoleErrors.length > 0) failures.push(`Ошибки консоли: ${consoleErrors.join(' | ')}`);

await browser.close();

console.log(
	JSON.stringify(
		{
			ok: failures.length === 0,
			failures,
			screenshots: [
				'artifacts/home-desktop.png',
				'artifacts/contacts-desktop.png',
				'artifacts/home-mobile.png',
				'artifacts/home-320.png',
			],
		},
		null,
		2,
	),
);

if (failures.length > 0) process.exit(1);
