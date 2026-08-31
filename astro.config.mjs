// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const isGitHubPages = process.env.DEPLOY_TARGET === 'github';
const site = isGitHubPages ? 'https://teassty.github.io' : process.env.SITE_URL;
const integrations = site
	? [
			sitemap({
				filter: (page) => !page.endsWith('/404/') && !page.endsWith('/privacy/'),
			}),
		]
	: [];

// https://astro.build/config
export default defineConfig({
	site,
	base: isGitHubPages ? '/glina-i-teplo' : '/',
	trailingSlash: 'always',
	integrations,
	devToolbar: { enabled: false },
});
