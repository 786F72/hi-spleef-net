import landing from './babel.html';

function unavailable(seconds) {
  return new Response(null, {
    status: 503,
    headers: { 'Retry-After': String(seconds), 'Cache-Control': 'no-store' }
  });
}

const domains = ['minecat.net', 'lattices.net', 'lattices.org', 'ollvm.com', 'pkey.org', 'sad.pet', 'spleef.net'];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname;
    const domain = domains.find(domain => host === domain || host.endsWith('.' + domain));
    if (!domain) return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });

    if (url.pathname === '/robots.txt') {
      const robots = host === domain
        ? 'User-agent: *\nAllow: /\nSitemap: https://minecat.net/sitemap.xml\n'
        : 'User-agent: *\nAllow: /b\nDisallow: /\n';
      return new Response(request.method === 'HEAD' ? null : robots, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    if (host === domain && url.pathname === '/about/babel') {
      return new Response(request.method === 'HEAD' ? null : landing, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname === '/babel/image') {
      let image;
      try {
        image = new URL(url.searchParams.get('url'));
      } catch {
        return new Response(null, { status: 400 });
      }
      if (image.protocol !== 'https:' || !image.hostname.startsWith('avatars.') ||
          (!image.hostname.endsWith('.steamstatic.com') && !image.hostname.endsWith('.steamusercontent.com')) ||
          image.port || image.username || image.password)
        return new Response(null, { status: 400 });

      let response;
      try {
        response = await fetch(image.href, {
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
          cf: { cacheEverything: true, cacheTtl: 604800 }
        });
      } catch {
        return new Response(null, { status: 502 });
      }
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/'))
        return new Response(null, { status: 502 });
      return new Response(request.method === 'HEAD' ? null : response.body, {
        headers: {
          'Content-Type': response.headers.get('Content-Type'),
          'Cache-Control': 'public, max-age=604800',
          'X-Robots-Tag': 'noindex, nofollow'
        }
      });
    }

    if (url.pathname.startsWith('/babel/avatar/')) {
      const value = url.pathname.slice('/babel/avatar/'.length);
      const account = Number(value);
      if (!/^[1-9]\d{0,9}$/.test(value) || account > 4294967295)
        return new Response(null, { status: 404 });

      const key = new Request(`https://minecat.net/babel/avatar/${account}?v=2`);
      const cached = await caches.default.match(key);
      if (cached) return cached;

      const cooldownKey = new Request('https://minecat.net/babel/steam-cooldown');
      const cooldown = await caches.default.match(cooldownKey);
      const until = cooldown ? Number(await cooldown.text()) : 0;
      if (until > Date.now()) return unavailable(Math.ceil((until - Date.now()) / 1000));

      async function pause(seconds) {
        await caches.default.put(cooldownKey, new Response(String(Date.now() + seconds * 1000), {
          headers: { 'Cache-Control': `public, max-age=${seconds}` }
        }));
        return unavailable(seconds);
      }

      const steam = 76561197960265728n + BigInt(account);
      let profile;
      try {
        profile = await fetch(`https://steamcommunity.com/profiles/${steam}/`, {
          signal: AbortSignal.timeout(6000)
        });
      } catch {
        return pause(60);
      }
      if (profile.status === 403 || profile.status === 429 || profile.status >= 500) {
        const retry = profile.headers.get('Retry-After');
        const seconds = /^\d+$/.test(retry || '') ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
        return pause(Math.max(600, Math.ceil(seconds) || 0));
      }
      if (!profile.ok && profile.status !== 404) return pause(60);

      let avatar;
      if (profile.ok) {
        await new HTMLRewriter().on('.playerAvatarAutoSizeInner img', {
          element(element) {
            avatar = element.getAttribute('src') || element.getAttribute('srcset')?.split(/[ ,]/)[0];
          }
        }).transform(profile).text();
      }
      let image;
      try {
        image = new URL(avatar);
      } catch {}
      const valid = image?.protocol === 'https:' && (
        image.hostname.endsWith('.steamstatic.com') || image.hostname.endsWith('.steamusercontent.com')
      );
      const response = Response.json(valid ? { url: image.href } : {}, {
        status: valid ? 200 : 404,
        headers: {
          'Cache-Control': `public, max-age=${valid ? 604800 : 86400}`,
          'X-Robots-Tag': 'noindex, nofollow'
        }
      });
      await caches.default.put(key, response.clone());
      return response;
    }

    if (url.pathname === '/b' || url.pathname.startsWith('/b/')) {
      url.pathname = '/babel' + url.pathname.slice(2);
      return new Response(null, {
        status: 301,
        headers: { Location: url.href, 'X-Robots-Tag': 'noindex, nofollow' }
      });
    }

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url.href));
    const seed = new DataView(digest);
    let a = seed.getUint32(0);
    let b = seed.getUint32(4);
    let c = seed.getUint32(8);
    let d = seed.getUint32(12);

    function next() {
      const value = (a + b + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = ((c << 21) | (c >>> 11)) + value | 0;
      return value >>> 0;
    }

    const tiles = Array.from({ length: 16 }, () => {
      const account = next() || 1;
      const profile = 76561197960265728n + BigInt(account);
      return `<a href="https://steamcommunity.com/profiles/${profile}/" rel="nofollow" aria-label="Open Steam profile"><img data-avatar="${account}" alt="" width="119" height="119"></a>`;
    }).join('\n');
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>babel</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
      body {
        margin: 1.5rem;
        background: #fff;
        color: #000;
        font: clamp(12px, 3vw, 16px)/1.5 system-ui, sans-serif;
      }

      main {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.75rem;
        max-width: 32rem;
      }

      a {
        display: block;
        aspect-ratio: 1;
        background: #f2f2f2;
      }

      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    </style>
  </head>
  <body>
    <main>${tiles}</main>
    <script>
      const controller = new AbortController();
      const pictures = new Set();
      addEventListener('pagehide', () => {
        controller.abort();
        for (const picture of pictures) URL.revokeObjectURL(picture);
      });

      function show(image, blob) {
        const picture = URL.createObjectURL(blob);
        pictures.add(picture);
        image.onerror = () => image.remove();
        image.src = picture;
      }

      async function load() {
        const cache = await caches.open('babel-avatars-v1').catch(() => null);
        let paused = false;
        for (const image of document.querySelectorAll('img[data-avatar]')) {
          try {
            const key = '/babel/avatar/' + image.dataset.avatar;
            const saved = await cache?.match(key).catch(() => null);
            if (saved) {
              show(image, await saved.blob());
              continue;
            }

            if (paused) continue;
            const response = await fetch(key + '?v=2', { signal: controller.signal });
            if (response.status === 503 || response.status === 429) {
              paused = true;
              continue;
            }
            if (response.ok) {
              const avatar = await response.json();
              const picture = await fetch('/babel/image?url=' + encodeURIComponent(avatar.url), {
                signal: controller.signal
              });
              if (picture.ok && picture.headers.get('Content-Type')?.startsWith('image/')) {
                const blob = await picture.blob();
                if (cache) await cache.put(key, new Response(blob)).catch(() => {});
                show(image, blob);
              } else {
                image.remove();
              }
            } else {
              image.remove();
            }
          } catch {
            if (controller.signal.aborted) break;
            paused = true;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (controller.signal.aborted) break;
        }
      }
      load();
    </script>
  </body>
</html>`;
    return new Response(request.method === 'HEAD' ? null : html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
    });
  }
};
