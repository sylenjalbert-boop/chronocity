const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

exports.ouryChat = onRequest(
    { secrets: ['ANTHROPIC_API_KEY'], cors: ['https://chronocity-70122.web.app', 'http://localhost'] },
    async (req, res) => {
        if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

        const { systemPrompt, messages } = req.body;
        if (!systemPrompt || !messages) { res.status(400).send('Missing params'); return; }

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey.value(),
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 300,
                    system: systemPrompt,
                    messages: messages
                })
            });

            const data = await response.json();
            res.json(data);
        } catch (e) {
            console.error('Oury API error:', e);
            res.status(500).json({ error: e.message });
        }
    }
);
