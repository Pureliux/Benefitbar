import dotenv from 'dotenv';
dotenv.config();
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import logger from './utils/logger.js';

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

function isLocalPocketBaseUrl(value) {
	try {
		const url = new URL(value);
		return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
	} catch {
		return false;
	}
}

function shouldStartPocketBase() {
	const setting = String(process.env.START_POCKETBASE || '').toLowerCase();
	if (['false', '0', 'no'].includes(setting)) {
		return false;
	}
	if (['true', '1', 'yes'].includes(setting)) {
		return true;
	}

	return process.env.NODE_ENV === 'production';
}

function startBundledPocketBase() {
	if (!shouldStartPocketBase() || !isLocalPocketBaseUrl(pocketBaseProxyTarget)) {
		return null;
	}

	const pocketBaseDir = path.resolve(__dirname, '../../../pocketbase');
	const binaryName = process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase';
	const pocketBaseBinary = path.join(pocketBaseDir, binaryName);

	if (!fs.existsSync(pocketBaseBinary)) {
		logger.warn(`PocketBase binary not found at ${pocketBaseBinary}`);
		return null;
	}

	const child = spawn(pocketBaseBinary, [
		'serve',
		'--http=0.0.0.0:8090',
		'--encryptionEnv=PB_ENCRYPTION_KEY',
		'--dir=./pb_data',
		'--migrationsDir=./pb_migrations',
		'--hooksDir=./pb_hooks',
		'--hooksWatch=false',
	], {
		cwd: pocketBaseDir,
		env: process.env,
		stdio: 'inherit',
	});

	child.on('error', (error) => {
		logger.error('Failed to start bundled PocketBase:', error);
	});

	child.on('exit', (code, signal) => {
		logger.warn(`Bundled PocketBase exited with code ${code ?? 'none'} and signal ${signal ?? 'none'}`);
	});

	logger.info('Bundled PocketBase start requested');
	return child;
}

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

const pocketBaseProcess = startBundledPocketBase();
const [
	{ default: routes },
	{ errorMiddleware },
	{ globalRateLimit },
	{ attachAuth },
	{ BodyLimit },
] = await Promise.all([
	import('./routes/index.js'),
	import('./middleware/error.js'),
	import('./middleware/global-rate-limit.js'),
	import('./utils/tokenUtils.js'),
	import('./constants/common.js'),
]);

app.set('trust proxy', true);

process.on('uncaughtException', (error) => {
	logger.error('Uncaught exception:', error);
});
  
process.on('unhandledRejection', (reason, promise) => {
	logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', async () => {
	logger.info('Interrupted');
	if (pocketBaseProcess && !pocketBaseProcess.killed) {
		pocketBaseProcess.kill('SIGTERM');
	}
	process.exit(0);
});

process.on('SIGTERM', async () => {
	logger.info('SIGTERM signal received');
	if (pocketBaseProcess && !pocketBaseProcess.killed) {
		pocketBaseProcess.kill('SIGTERM');
	}

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
