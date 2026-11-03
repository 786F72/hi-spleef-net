import list from './bip39-wordlist.txt';

const words = list.trim().split('\n');
const domains = ['minecat.net', 'lattices.net', 'lattices.org', 'ollvm.com', 'pkey.org', 'sad.pet', 'spleef.net'];

export default {
  fetch(request) {
    const host = new URL(request.url).hostname;
    const domain = domains.find(domain => host === domain || host.endsWith('.' + domain));
    if (!domain) return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });

    const used = new Set();
    function number() {
      let value;
      do {
        value = (100000000000n + crypto.getRandomValues(new BigUint64Array(1))[0] % 900000000000n).toString();
      } while (used.has(value));
      used.add(value);
      return value;
    }

    const links = Array.from({ length: 7 }, (_, index) =>
      `<a href="https://${number()}.${domain}/b/${number()}"><img src="https://www.google.com/s2/favicons?domain=${domain}&amp;sz=32" alt="" width="16" height="16">Page ${index + 1}</a>`).join('\n');
    const text = Array.from(crypto.getRandomValues(new Uint16Array(4096)), value => words[value & 2047]).join(' ');
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Babel</title>
    <style>
      body {
        margin: 1rem;
        font: clamp(12px, 3vw, 16px)/1.4 Arial, sans-serif;
      }

      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      a {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
    </style>
  </head>
  <body>
    <nav>${links}</nav>
    <main>${text}</main>
  </body>
</html>`;
    return new Response(request.method === 'HEAD' ? null : html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
};
