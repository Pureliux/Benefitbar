import dotenv from 'dotenv';
dotenv.config();
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import routes from './routes/index.js';
import { errorMiddleware } from './middleware/error.js';
import { globalRateLimit } from './middleware/global-rate-limit.js';
import logger from './utils/logger.js';
import { attachAuth } from './utils/tokenUtils.js';
import { BodyLimit } from './constants/common.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pocketBaseProxyTarget = process.env.POCKETBASE_URL || 'http://localhost:8090';
const webDistPath = process.env.WEB_DIST_PATH
	? path.resolve(process.cwd(), process.env.WEB_DIST_PATH)
	: path.resolve(__dirname, '../../../dist/apps/web');
const webIndexPath = path.join(webDistPath, 'index.html');
const apiPrefixes = [
	'/hcgi/api',
	'/hcgi/platform',
	'/platform',
	'/auth',
	'/admin',
	'/oauth',
	'/submissions',
	'/attachments',
	'/audit-log',
	'/health',
];
const hopByHopHeaders = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
]);

function buildCorsOrigin() {
	const configuredOrigins = (process.env.CORS_ORIGIN || '')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

	if (!configuredOrigins.length) {
		return true;
	}

	return (origin, callback) => {
		if (!origin || configuredOrigins.includes(origin)) {
			return callback(null, true);
		}

		return callback(new Error('Not allowed by CORS'));
	};
}

function proxyPocketBase(req, res) {
	let targetUrl;

	try {
		targetUrl = new URL(req.url || '/', pocketBaseProxyTarget);
	} catch (err) {
		logger.error('Invalid PocketBase proxy target:', err);
		return res.status(500).json({ error: 'PocketBase proxy is not configured correctly' });
	}

	const headers = { ...req.headers, host: targetUrl.host };
	for (const headerName of Object.keys(headers)) {
		if (hopByHopHeaders.has(headerName.toLowerCase())) {
			delete headers[headerName];
		}
	}

	const proxyReq = (targetUrl.protocol === 'https:' ? https : http).request({
		protocol: targetUrl.protocol,
		hostname: targetUrl.hostname,
		port: targetUrl.port,
		method: req.method,
		path: `${targetUrl.pathname}${targetUrl.search}`,
		headers,
	}, (proxyRes) => {
		res.statusCode = proxyRes.statusCode || 502;
		res.statusMessage = proxyRes.statusMessage || res.statusMessage;

		for (const [headerName, headerValue] of Object.entries(proxyRes.headers)) {
			const normalizedHeader = headerName.toLowerCase();
			if (
				hopByHopHeaders.has(normalizedHeader) ||
				normalizedHeader.startsWith('access-control-')
			) {
				continue;
			}

			if (headerValue !== undefined) {
				res.setHeader(headerName, headerValue);
			}
		}

		proxyRes.pipe(res);
	});

	proxyReq.on('error', (err) => {
		logger.error('PocketBase proxy request failed:', err);
		if (!res.headersSent) {
			res.status(502).json({ error: 'PocketBase is not reachable' });
		} else {
			res.end();
		}
	});

	req.pipe(proxyReq);
}

function shouldServeSpa(req) {
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		return false;
	}

	if (!req.accepts('html')) {
		return false;
	}

	return !apiPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`));
}

app.set('trust proxy', true);

process.on('uncaughtException', (error) => {
	logger.error('Uncaught exception:', error);
});
  
process.on('unhandledRejection', (reason, promise) => {
	logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', async () => {
	logger.info('Interrupted');
	process.exit(0);
});

process.on('SIGTERM', async () => {
	logger.info('SIGTERM signal received');

	await new Promise(resolve => setTimeout(resolve, 3000));

	logger.info('Exiting');
	process.exit();
});

app.use(helmet({
	contentSecurityPolicy: false,
	crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
	origin: buildCorsOrigin(),
	credentials: true,
}));
app.use(morgan('combined'));
app.use(globalRateLimit);
app.use('/hcgi/platform', proxyPocketBase);
app.use('/platform', proxyPocketBase);
app.use(express.json({
	limit: BodyLimit,
}));
app.use(express.urlencoded({ 
	extended: true,
	limit: BodyLimit,
}));
app.use(attachAuth);

const apiRoutes = routes();
app.use('/hcgi/api', apiRoutes);
app.use('/', apiRoutes);

if (fs.existsSync(webIndexPath)) {
	app.use(express.static(webDistPath));
	app.use((req, res, next) => {
		if (!shouldServeSpa(req)) {
			return next();
		}

		return res.sendFile(webIndexPath);
	});
}

app.use(errorMiddleware);

app.use((req, res) => {
	res.status(404).json({ error: 'Route not found' });
});

const port = process.env.PORT || 3001;

app.listen(port, () => {
	logger.info(`API Server running on http://localhost:${port}`);
});

export default app;
