import { readdir } from 'node:fs/promises';
import { extname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const mediaDirectory = fileURLToPath(new URL('../public/media/', import.meta.url));
const files = (await readdir(mediaDirectory)).filter((file) =>
	['.jpg', '.jpeg', '.png'].includes(extname(file).toLowerCase()),
);

for (const file of files) {
	const source = join(mediaDirectory, file);
	const { name } = parse(file);

	for (const width of [560, 1080]) {
		const image = sharp(source).rotate().resize({
			width,
			withoutEnlargement: true,
		});

		await Promise.all([
			image.clone().webp({ quality: 82 }).toFile(join(mediaDirectory, `${name}-${width}.webp`)),
			image.clone().avif({ quality: 58 }).toFile(join(mediaDirectory, `${name}-${width}.avif`)),
		]);
	}
}

console.log(`Optimized ${files.length} source images.`);
