/**
 * Vercel Serverless Function - Proxy to AgentRouter
 * 
 * Bypasses browser/client restrictions by:
 * 1. Making requests server-side (no CORS)
 * 2. Setting proper User-Agent (mimics CLI tool)
 * 3. Stripping browser-specific headers (Origin, Referer)
 */

export default async function handler(req, res) {
    // CORS headers for browser
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const BASE_URL = 'https://agentrouter.org/v1';
    const endpoint = req.query.endpoint || '';
    const targetUrl = `${BASE_URL}/${endpoint}`;

    try {
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'node-fetch/1.0 (compatible; RichAi/1.0)',
            'Accept': 'application/json',
        };

        // Forward Authorization header
        if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization;
        }

        // Do NOT forward Origin, Referer, or other browser headers
        // This makes the request look like it's from a server/CLI

        const fetchOptions = {
            method: req.method,
            headers,
        };

        // Forward body for POST
        if (req.method === 'POST' && req.body) {
            const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            fetchOptions.body = bodyStr;
        }

        const isStream = req.body?.stream === true;

        const response = await fetch(targetUrl, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            res.setHeader('Content-Type', 'application/json');
            return res.status(response.status).send(errorText);
        }

        if (isStream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    res.write(chunk);
                }
            } catch (e) {
                // Stream interrupted
            }
            res.end();
        } else {
            const data = await response.text();
            const contentType = response.headers.get('content-type') || 'application/json';
            res.setHeader('Content-Type', contentType);
            res.status(response.status).send(data);
        }
    } catch (error) {
        res.status(500).json({ error: { message: `Proxy error: ${error.message}` } });
    }
}
