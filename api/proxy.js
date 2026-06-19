const https = require('https');

module.exports = function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const endpoint = req.query.endpoint || '';
    const targetPath = '/v1/' + endpoint;

    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'node/18 RichAi-Proxy/1.0',
        'Accept': 'application/json, text/event-stream',
    };

    if (req.headers.authorization) {
        headers['Authorization'] = req.headers.authorization;
    }

    let bodyStr = '';
    if (req.method === 'POST' && req.body) {
        bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const options = {
        hostname: 'agentrouter.org',
        port: 443,
        path: targetPath,
        method: req.method,
        headers: headers,
    };

    const proxyReq = https.request(options, function (proxyRes) {
        // Forward status and content-type
        const ct = proxyRes.headers['content-type'] || 'application/json';
        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'no-cache');
        res.status(proxyRes.statusCode);

        // Pipe response directly
        proxyRes.on('data', function (chunk) {
            res.write(chunk);
        });

        proxyRes.on('end', function () {
            res.end();
        });
    });

    proxyReq.on('error', function (err) {
        res.status(500).json({ error: { message: 'Proxy error: ' + err.message } });
    });

    if (bodyStr) {
        proxyReq.write(bodyStr);
    }

    proxyReq.end();
};
