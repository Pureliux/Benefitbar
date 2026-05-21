const API_SERVER_URL = (import.meta.env.VITE_API_SERVER_URL || "/api/index.php").replace(/\/$/, "");

const apiServerClient = {
    fetch: async (url, options = {}) => {
        const headers = new Headers(options.headers || {});
        const token = localStorage.getItem('backend_token');
        const method = (options.method || 'GET').toUpperCase();
        let requestUrl = url;

        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        if (method === 'GET') {
            const separator = requestUrl.includes('?') ? '&' : '?';
            requestUrl = `${requestUrl}${separator}_=${Date.now()}`;
        }

        return await window.fetch(API_SERVER_URL + requestUrl, {
            ...options,
            headers,
            cache: method === 'GET' ? 'no-store' : options.cache,
        });
    }
};

export default apiServerClient;

export { apiServerClient, API_SERVER_URL };
