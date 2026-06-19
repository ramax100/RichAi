/**
 * Cloudflare Worker - AgentRouter Proxy
 * 
 * Deploy ini di Cloudflare Workers (gratis):
 * 1. Buka https://workers.cloudflare.com
 * 2. Buat akun gratis
 * 3. Klik "Create Worker"
 * 4. Paste seluruh kode ini
 * 5. Klik "Deploy"
 * 6. Copy URL worker (misal: https://agentrouter-proxy.xxx.workers.dev)
 * 7. Paste URL tersebut di setting Proxy URL pada aplikasi
 */

export default {
    async fetch(request) {
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // Handle preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 200, headers: corsHeaders });
        }

        const url = new URL(request.url);
        const endpoint = url.searchParams.get('endpoint') || '';
        const targetUrl = `https://agentrouter.org/v1/${endpoint}`;

        try {
            const headers = {
                'Content-Type': 'application/json',
            };

            // Forward auth header
            const auth = request.headers.get('Authorization');
            if (auth) headers['Authorization'] = auth;

            const fetchOptions = {
                method: request.method,
                headers,
            };

            if (request.method === 'POST') {
                fetchOptions.body = await request.text();
            }

            const response = await fetch(targetUrl, fetchOptions);

            // Create new response with CORS headers
            const newHeaders = new Headers(response.headers);
            Object.entries(corsHeaders).forEach(([key, value]) => {
                newHeaders.set(key, value);
            });

            return new Response(response.body, {
                status: response.status,
                headers: newHeaders,
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: { message: error.message } }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    }
};
