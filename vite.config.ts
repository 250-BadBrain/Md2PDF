import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export default defineConfig({
  worker: { format: 'es' },
  plugins: [react(), {
    name: 'offline-static-assets',
    generateBundle: { order: 'post', handler(_options, bundle) {
      const files = ['index.html', 'manifest.webmanifest', 'icon.svg', ...Object.keys(bundle).filter((file) => file.startsWith('assets/') && !file.endsWith('.map'))];
      const hash = createHash('sha256').update(JSON.stringify(files));
      for (const item of Object.values(bundle)) hash.update(item.type === 'chunk' ? item.code : item.source);
      for (const file of ['manifest.webmanifest', 'icon.svg']) hash.update(readFileSync(new URL(`./public/${file}`, import.meta.url)));
      const version = hash.digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const NAME='md2pdf-${version}';
const FILES=${JSON.stringify(files)}.map(file=>new URL(file,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(NAME).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('md2pdf-')&&key!==NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request; if(request.method!=='GET')return;
 const url=new URL(request.url); if(url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 if(FILES.includes(url.href))event.respondWith(caches.open(NAME).then(cache=>cache.match(request,{ignoreVary:true})).then(cached=>cached||fetch(request)));
 else if(request.mode==='navigate')event.respondWith(fetch(request).catch(()=>caches.open(NAME).then(cache=>cache.match(new URL('index.html',self.registration.scope)))));
});` });
    } },
  }],
});
