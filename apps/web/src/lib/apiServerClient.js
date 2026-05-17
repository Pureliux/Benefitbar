const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || "/hcgi/api";

const apiServerClient = {
    fetch: async (url, options = {}) => {
        const headers = new Headers(options.headers || {});
        const token = localStorage.getItem('backend_token');

        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        return await window.fetch(API_SERVER_URL + url, {
            ...options,
            headers,
        });
    }
};

export default apiServerClient;

export { apiServerClient };
