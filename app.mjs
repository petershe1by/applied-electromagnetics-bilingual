import * as pdfjs from './vendor/pdfjs/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/build/pdf.worker.mjs', import.meta.url).href;
const $ = id => document.getElementById(id);
const BOOK_CACHE='em-book-gh-electromagnetics-a16a92d75a02';
const KEY='em-reading-v1';
const safeStore={get(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}},set(x){try{localStorage.setItem(KEY,JSON.stringify(x))}catch{}}};
const saved=safeStore.get();
const hashPage=Number(new URLSearchParams(location.hash.slice(1)).get('page'));
const state={page:Math.max(1,Math.min(490,Math.round(hashPage||saved.page||1))),view:['both','en','zh'].includes(saved.view)?saved.view:'both',zoom:1};
let book,cache,activeDoc,activePart,renderBusy=false,renderAgain=false,downloadController,swReady=false,storageFailure=false;
let shellReady=Promise.resolve(false);
const urlFor=p=>new URL(p,location.href).href;
function persist(){safeStore.set({page:state.page,view:state.view});history.replaceState(null,'','#page='+state.page)}
function offlineMessage(){ $('connection').textContent=navigator.onLine?'在线 · 自动保存进度':'离线阅读'; }
function updateControls(){
  $('pageNumber').value=state.page;$('prev').disabled=state.page<=1;$('next').disabled=state.page>=book.pages;
  $('readingProgress').style.width=(state.page/book.pages*100)+'%';
  $('fit').textContent=state.zoom===1?'适合宽度':Math.round(state.zoom*100)+'%';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
  const chapters=book.toc.filter(x=>x.level===1);let current=chapters[0];for(const t of chapters)if(t.page<=state.page)current=t;
  document.querySelectorAll('#contents button').forEach(b=>{const on=Number(b.dataset.page)===current?.page;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  persist();
}
async function cachedResponse(part){return cache?.match(urlFor(part.file))}
async function fetchPart(part,signal){
  const existing=await cachedResponse(part);if(existing)return existing.arrayBuffer();
  const response=await fetch(urlFor(part.file),{signal,credentials:'same-origin'});
  if(!response.ok)throw new Error('下载失败，请检查网络或重新登录后重试。');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength!==part.bytes)throw new Error('书籍文件未完整收到，请重试。');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==part.sha256)throw new Error('文件校验未通过，请重试。');
  if(cache)try{await cache.put(urlFor(part.file),new Response(bytes.slice(0),{headers:{'Content-Type':'application/pdf','Content-Length':String(bytes.byteLength)}}))}catch{storageFailure=true}
  return bytes;
}
async function drawPage(){
  const snapshot={...state};const part=book.parts.find(p=>p.start<=snapshot.page&&p.end>=snapshot.page);
  $('loading').hidden=false;$('error').hidden=true;$('paper').hidden=true;
  $('loading').textContent=navigator.onLine?'正在打开第 '+snapshot.page+' 页…':'正在读取离线页面…';
  try{
    if(activePart!==part.file){
      if(activeDoc){await activeDoc.destroy();activeDoc=null;activePart=null;}
      const bytes=await fetchPart(part);
      activeDoc=await pdfjs.getDocument({data:new Uint8Array(bytes),cMapUrl:urlFor('./vendor/pdfjs/cmaps/'),cMapPacked:true,standardFontDataUrl:urlFor('./vendor/pdfjs/standard_fonts/'),wasmUrl:urlFor('./vendor/pdfjs/wasm/'),isEvalSupported:false}).promise;
      activePart=part.file;
    }
    if(renderAgain)return;
    const page=await activeDoc.getPage(snapshot.page-part.start+1);
    const original=page.getViewport({scale:1});
    const half=snapshot.page!==1&&snapshot.view!=='both';const width=original.width/(half?2:1);
    const clipX=half&&snapshot.view==='zh'?original.width/2:0;
    const space=$('paperArea').clientWidth-(innerWidth<480?12:innerWidth<900?24:56);
    const scale=Math.max(.15,space/width)*snapshot.zoom;
    const viewport=page.getViewport({scale});
    const ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(14000000/(width*scale*viewport.height)));
    const canvas=$('pageCanvas');canvas.width=Math.round(width*scale*ratio);canvas.height=Math.round(viewport.height*ratio);
    canvas.style.width=Math.round(width*scale)+'px';canvas.style.height=Math.round(viewport.height)+'px';
    canvas.setAttribute('aria-label',`第${snapshot.page}页，${snapshot.view==='both'?'中英对照':snapshot.view==='zh'?'中文':'英文'}`);
    await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,-clipX*scale*ratio,0]}).promise;
    if(renderAgain)return;
    $('paper').hidden=false;$('paper').style.alignSelf=snapshot.zoom>1?'flex-start':'center';
    $('loading').hidden=true;
    await updateCacheStatus();
  }catch(e){
    if(renderAgain)return;
    $('loading').hidden=true;$('paper').hidden=true;$('error').hidden=false;
    $('errorText').textContent=navigator.onLine?(e.message||'请稍后重试。'):'此页所在分卷尚未保存。请先联网，在“离线阅读”中下载全书。';
  }
}
async function scheduleRender(){
  if(!book)return;updateControls();renderAgain=true;if(renderBusy)return;
  renderBusy=true;try{while(renderAgain){renderAgain=false;await drawPage()}}finally{renderBusy=false}
}
function go(page){const n=Number(page);if(!Number.isFinite(n))return;state.page=Math.max(1,Math.min(book.pages,Math.round(n)));scheduleRender();window.scrollTo({top:0});$('paperArea').scrollLeft=0}
async function updateCacheStatus(){
  if(!book)return;let count=0,pages=0,bytes=0;
  for(const p of book.parts)if(await cachedResponse(p)){count++;pages+=p.end-p.start+1;bytes+=p.bytes}
  $('cacheCount').textContent=`已保存 ${pages} / ${book.pages} 页`;$('cacheSize').textContent=`书籍已缓存 ${(bytes/1048576).toFixed(1)} / 83.1 MiB`;
  $('downloadProgress').max=book.parts.length;$('downloadProgress').value=count;
  $('downloadBook').textContent=count===book.parts.length?'检查离线就绪状态':count?'继续下载剩余内容':'下载全书供离线阅读';
  return {count,pages};
}
async function downloadBook(){
  if(downloadController)return;
  if(!cache||!('serviceWorker' in navigator)){ $('downloadStatus').textContent='此浏览器不支持离线保存。请使用支持离线应用的浏览器，并关闭无痕模式。';return;}
  downloadController=new AbortController();$('downloadBook').disabled=true;$('clearCache').disabled=true;$('cancelDownload').hidden=false;storageFailure=false;
  try{
    $('downloadStatus').textContent='正在准备离线阅读器…';
    const ready=await shellReady;
    if(!ready)throw new Error('阅读器资源未准备好。请联网刷新页面后重试。');
    await navigator.storage?.persist?.();
    for(let i=0;i<book.parts.length;i++){
      if(downloadController.signal.aborted)throw new DOMException('Paused','AbortError');
      const p=book.parts[i];$('downloadStatus').textContent=`正在保存第 ${p.start}–${p.end} 页（${i+1}/${book.parts.length}）…`;
      await fetchPart(p,downloadController.signal);await updateCacheStatus();
      if(storageFailure)throw new Error('浏览器可用空间不足，未能保存全部内容。请释放空间后继续下载。');
    }
    const result=await updateCacheStatus();
    if(result.count!==book.parts.length)throw new Error('仍有分卷未保存，请继续下载。');
    $('downloadStatus').textContent='全书与阅读器已保存。现在可以断网，在此浏览器中重新打开本链接阅读。';
  }catch(e){$('downloadStatus').textContent=e.name==='AbortError'?'已暂停，已保存的内容会保留，下次可继续。':e.message}
  finally{downloadController=null;$('downloadBook').disabled=false;$('clearCache').disabled=false;$('cancelDownload').hidden=true}
}
function initEvents(){
  $('prev').onclick=()=>go(state.page-1);$('next').onclick=()=>go(state.page+1);
  $('pageForm').onsubmit=e=>{e.preventDefault();go($('pageNumber').value)};
  $('retry').onclick=scheduleRender;
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.zoom=1;scheduleRender()});
  $('zoomIn').onclick=()=>{state.zoom=Math.min(3,Math.round((state.zoom+.25)*100)/100);scheduleRender()};
  $('zoomOut').onclick=()=>{state.zoom=Math.max(.5,state.zoom-.25);scheduleRender()};
  $('fit').onclick=()=>{state.zoom=1;scheduleRender()};
  const closeMenu=()=>{$('sidebar').classList.remove('open');$('menu').setAttribute('aria-expanded','false')};
  $('menu').onclick=()=>{const open=$('sidebar').classList.toggle('open');$('menu').setAttribute('aria-expanded',String(open))};$('closeMenu').onclick=closeMenu;
  for(const t of book.toc.filter(x=>x.level===1)){
    const b=document.createElement('button');b.dataset.page=t.page;b.append(document.createTextNode(t.page===1?'版本说明':t.title));const p=document.createElement('span');p.className='chapter-page';p.textContent=t.page;b.append(p);b.onclick=()=>{go(t.page);closeMenu()};$('contents').append(b);
  }
  $('offlineOpen').onclick=()=>{$('offlineDialog').showModal();updateCacheStatus()};$('closeOffline').onclick=()=>$('offlineDialog').close();
  $('downloadBook').onclick=downloadBook;$('cancelDownload').onclick=()=>downloadController?.abort();
  $('clearCache').onclick=async()=>{if(!confirm('清除本设备已保存的书籍？阅读进度会保留。'))return;await caches.delete(BOOK_CACHE);cache=await caches.open(BOOK_CACHE);await updateCacheStatus();$('downloadStatus').textContent='离线书籍已清除。'};
  addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName)||$('offlineDialog').open)return;if(e.key==='ArrowRight'){e.preventDefault();go(state.page+1)}if(e.key==='ArrowLeft'){e.preventDefault();go(state.page-1)}});
  addEventListener('online',offlineMessage);addEventListener('offline',offlineMessage);
  let timer;addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(scheduleRender,200)});
}
async function setupOffline(){
  if(!('serviceWorker'in navigator))return false;
  try{
    const reg=await navigator.serviceWorker.register('./sw.js');
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline setup timeout')),180000))]);
    if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Activation timeout')),30000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve()},{once:true})});
    swReady=true;return true;
  }catch{return false}
}
try{
  book=await fetch('./book.json').then(r=>{if(!r.ok)throw new Error('目录加载失败');return r.json()});
  try{cache=await caches.open(BOOK_CACHE)}catch{}
  shellReady=setupOffline();offlineMessage();initEvents();scheduleRender();
}catch(e){$('loading').textContent='阅读器未能载入。首次使用请联网刷新；离线使用前需要完成全书下载。';console.error(e)}
