/**
 * Local Proxy Server untuk AgentRouter
 * 
 * Jalankan di komputer Anda:
 *   node local-proxy.js
 * 
 * Lalu di app, set Proxy URL ke: http://localhost:3456
 * 
 * Ini pasti works karena request keluar dari IP komputer Anda sendiri.
 */

const http = require('http');
const https = require('https');

const PORT = 3456;

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Parse URL
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const endpoint = url.searchParams.get('endpoint') || '';
    const targetPath = '/v1/' + endpoint;

    // Collect request body
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
        };

        if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization;
        }

        if (body) {
            headers['Content-Length'] = Buffer.byteLength(body);
        }

        const options = {
            hostname: 'agentrouter.org',
            port: 443,
            path: targetPath,
            method: req.method,
            headers: headers,
        };

        const proxyReq = https.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, {
                'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
            });

            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: err.message } }));
        });

        if (body) proxyReq.write(body);
        proxyReq.end();
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('=================================');
    console.log('  AgentRouter Local Proxy');
    console.log('  Running on http://localhost:' + PORT);
    console.log('=================================');
    console.log('');
    console.log('Di app, set Proxy URL ke:');
    console.log('  http://localhost:' + PORT);
    console.log('');
    console.log('Tekan Ctrl+C untuk stop');
    console.log('');
});
