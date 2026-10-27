const SHELL='em-reader-gh-electromagnetics-v4';
const BOOK='em-book-gh-electromagnetics-a16a92d75a02';
const BASE=new URL('./',self.location.href);
const absolute=p=>new URL(p,BASE).href;
const CORE=['./','./index.html','./style.css','./app.mjs?v=perf1','./book.json','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  for(const p of CORE){const r=await fetch(absolute(p),{cache:'no-cache'});if(!r.ok||r.redirected)throw new Error('Could not cache '+p);await cache.put(absolute(p),r)}
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const fresh=await caches.open(SHELL);
  for(const k of await caches.keys())if(k.startsWith('em-reader-gh-electromagnetics-')&&k!==SHELL){const old=await caches.open(k);for(const req of await old.keys())if(new URL(req.url).pathname.startsWith(BASE.pathname+'vendor/')&&!await fresh.match(req)){const r=await old.match(req);if(r)await fresh.put(req,r)}await caches.delete(k)}
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  const path=url.pathname.slice(BASE.pathname.length);
  if(request.mode==='navigate'){
    event.respondWith((async()=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6000);try{return await fetch(request,{signal:controller.signal})}catch(e){const r=await(await caches.open(SHELL)).match(absolute('index.html'));if(r)return r;throw e}finally{clearTimeout(timer)}})());return;
  }
  if(path.startsWith('read/')&&path.endsWith('.pdf')){
    event.respondWith((async()=>{const cached=await(await caches.open(BOOK)).match(url.href);return cached&&!request.headers.has('Range')?cached:fetch(request)})());return;
  }
  if(['app.mjs','style.css','book.json','manifest.webmanifest','icon.svg','shell-assets.json'].includes(path)||path.startsWith('vendor/')){
    event.respondWith((async()=>{const c=await caches.open(SHELL);const hit=await c.match(url.href);if(hit)return hit;const r=await fetch(request);if(r.ok&&!r.redirected)event.waitUntil(c.put(url.href,r.clone()).catch(()=>{}));return r})());
  }
});
