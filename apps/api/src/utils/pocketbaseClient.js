import dotenv from 'dotenv';
dotenv.config();
import Pocketbase from 'pocketbase';
import logger from './logger.js';

const POCKETBASE_HOST = process.env.POCKETBASE_URL || 'http://localhost:8090';
const POCKETBASE_HEALTH_RETRIES = Number(process.env.POCKETBASE_HEALTH_RETRIES || 30);

async function waitForHealth({ retries = POCKETBASE_HEALTH_RETRIES, delayMs = 1000 } = {}) {
    for (let i = 1; i <= retries; i++) {
        try {
            const response = await fetch(`${POCKETBASE_HOST}/api/health`, { method: 'HEAD' });

            if (response.ok) {
                return;
            }
        } catch {
            // PocketBase not reachable yet; retry below
        }

        logger.warn(`PocketBase not ready, retrying (${i}/${retries})...`);

        await new Promise((r) => setTimeout(r, delayMs));
    }

    throw new Error(`PocketBase health check failed after ${retries} retries`);
}

const pocketbaseClient = new Pocketbase(POCKETBASE_HOST);

pocketbaseClient.autoCancellation(false);

let authPromise = null;

function assertPocketBaseCredentials() {
    if (!process.env.PB_SUPERUSER_EMAIL || !process.env.PB_SUPERUSER_PASSWORD) {
        throw new Error('PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD must be configured');
    }
}

async function authenticateSuperuser() {
    assertPocketBaseCredentials();

    if (!pocketbaseClient.authStore.isValid && !authPromise) {
        authPromise = pocketbaseClient.collection('_superusers').authWithPassword(
            process.env.PB_SUPERUSER_EMAIL,
            process.env.PB_SUPERUSER_PASSWORD,
        ).finally(() => {
            authPromise = null;
        });
    }

    if (authPromise) {
        await authPromise;
    }
}

pocketbaseClient.beforeSend = async function (url, options) {
    if (url.includes('/api/collections/_superusers/auth-with-password')) {
        return { url, options };
    }

    await authenticateSuperuser();

    if (pocketbaseClient.authStore.isValid && pocketbaseClient.authStore.token) {
        options.headers = options.headers || {};
        options.headers['Authorization'] = pocketbaseClient.authStore.token;
    }

    return { url, options };
};

(async () => {
    try {
        await waitForHealth();
        await authenticateSuperuser();
        
        logger.info('PocketBase client initialized successfully');
    } catch (err) {
        logger.error('Failed to initialize PocketBase client:', err);

        process.exit(1);
    }
})();

export default pocketbaseClient;
export { pocketbaseClient };
