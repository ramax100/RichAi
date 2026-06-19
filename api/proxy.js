/**
 * Vercel Serverless Function - Proxy to AgentRouter
 * This bypasses CORS/browser restrictions by making API calls server-side.
 */

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const BASE_URL = 'https://agentrouter.org/v1';

    // Get the path from query parameter
    const endpoint = req.query.endpoint || '';
    const targetUrl = `${BASE_URL}/${endpoint}`;

    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        // Forward Authorization header
        if (req.headers.authorization) {
            fetchOptions.headers['Authorization'] = req.headers.authorization;
        }

        // Forward body for POST requests
        if (req.method === 'POST' && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        // Check if streaming is requested
        const isStream = req.body?.stream === true;

        if (isStream) {
            // For streaming, pipe the response directly
            const response = await fetch(targetUrl, fetchOptions);

            if (!response.ok) {
                const errorText = await response.text();
                return res.status(response.status).send(errorText);
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                res.write(chunk);
            }

            res.end();
        } else {
            // Non-streaming request
            const response = await fetch(targetUrl, fetchOptions);
            const data = await response.text();

            res.status(response.status);
            res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
            res.send(data);
        }
    } catch (error) {
        res.status(500).json({ error: { message: error.message } });
    }
}
