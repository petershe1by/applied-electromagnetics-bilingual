const SHELL='em-reader-gh-electromagnetics-v1';
const BOOK='em-book-gh-electromagnetics-a16a92d75a02';
const BASE=new URL('./',self.location.href);
const absolute=p=>new URL(p,BASE).href;
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  const response=await fetch(absolute('shell-assets.json'),{cache:'no-store'});
  if(!response.ok)throw new Error('Shell manifest unavailable');
  const list=await response.json();
  await cache.put(absolute('shell-assets.json'),new Response(JSON.stringify(list),{headers:{'Content-Type':'application/json'}}));
  let index=0;
  await Promise.all(Array.from({length:6},async()=>{
    while(index<list.length){const p=list[index++];const r=await fetch(absolute(p),{cache:'reload'});if(!r.ok||r.redirected)throw new Error('Could not cache '+p);await cache.put(absolute(p),r)}
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('em-reader-gh-electromagnetics-')&&k!==SHELL)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
  const request=event.request;const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  const path=url.pathname.slice(BASE.pathname.length);
  if(request.mode==='navigate'){
    event.respondWith((async()=>{try{return await fetch(request)}catch{return (await caches.open(SHELL)).match(absolute('index.html'))}})());return;
  }
  if(path.startsWith('read/')&&path.endsWith('.pdf')){
    event.respondWith((async()=>{const cached=await (await caches.open(BOOK)).match(url.href);return cached||fetch(request)})());return;
  }
  if(['app.mjs','style.css','book.json','manifest.webmanifest','icon.svg','shell-assets.json'].includes(path)||path.startsWith('vendor/')){
    event.respondWith((async()=>{const hit=await (await caches.open(SHELL)).match(url.href);return hit||fetch(request)})());
  }
});
