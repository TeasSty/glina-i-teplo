import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = fileURLToPath(new URL('../public/media/studio-logo-source.jpg', import.meta.url));
const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));

async function removeBackground(extract) {
	const { data, info } = await sharp(source)
		.extract(extract)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const cornerPixels = [
		0,
		(info.width - 1) * info.channels,
		(info.height - 1) * info.width * info.channels,
		((info.height - 1) * info.width + info.width - 1) * info.channels,
	];
	const background = [0, 1, 2].map(
		(channel) =>
			cornerPixels.reduce((sum, offset) => sum + data[offset + channel], 0) /
			cornerPixels.length,
	);

	for (let index = 0; index < data.length; index += info.channels) {
		const distance = Math.sqrt(
			(data[index] - background[0]) ** 2 +
				(data[index + 1] - background[1]) ** 2 +
				(data[index + 2] - background[2]) ** 2,
		);
		data[index + 3] = Math.round(Math.max(0, Math.min(255, ((distance - 7) / 27) * 255)));
	}

	return sharp(data, { raw: info }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
}

const mark = await removeBackground({ left: 65, top: 260, width: 900, height: 265 });
await mark
	.clone()
	.resize({ width: 420, withoutEnlargement: true })
	.png({ compressionLevel: 9 })
	.toFile(`${publicDirectory}/logo-mark.png`);

const favicon = await removeBackground({ left: 395, top: 255, width: 245, height: 275 });
await Promise.all([
	favicon
		.clone()
		.resize({ width: 64, height: 64, fit: 'contain' })
		.png({ compressionLevel: 9 })
		.toFile(`${publicDirectory}/favicon-64.png`),
	favicon
		.clone()
		.resize({ width: 180, height: 180, fit: 'contain' })
		.png({ compressionLevel: 9 })
		.toFile(`${publicDirectory}/apple-touch-icon.png`),
]);

console.log('Prepared transparent logo and favicon assets.');
