/* IndexedDB 存储层 */
'use strict';

const DB_NAME = 'peak11';
const DB_VER = 1;
let _db = null;

function openDB(){
  if(_db) return Promise.resolve(_db);
  return new Promise((res,rej)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains('foods'))  db.createObjectStore('foods',  {keyPath:'id'});
      if(!db.objectStoreNames.contains('plans'))  db.createObjectStore('plans',  {keyPath:'date'});
      if(!db.objectStoreNames.contains('logs'))   db.createObjectStore('logs',   {keyPath:'date'});
      if(!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', {keyPath:'id'});
      if(!db.objectStoreNames.contains('kv'))     db.createObjectStore('kv',     {keyPath:'k'});
    };
    req.onsuccess = ()=>{ _db = req.result; res(_db); };
    req.onerror = ()=>rej(req.error);
  });
}

function tx(store, mode, fn){
  return openDB().then(db=>new Promise((res,rej)=>{
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = ()=>res(req ? req.result ?? null : null);
    t.onerror = ()=>rej(t.error);
  }));
}
function dbGet(store,key){ return tx(store,'readonly',s=>s.get(key)); }
function dbPut(store,val){ return tx(store,'readwrite',s=>s.put(val)); }
function dbDel(store,key){ return tx(store,'readwrite',s=>s.delete(key)); }
function dbAll(store){ return tx(store,'readonly',s=>s.getAll()).then(r=>r||[]); }
function dbClear(store){ return tx(store,'readwrite',s=>s.clear()); }

async function seedIfNeeded(){
  const flag = await dbGet('kv','seeded');
  if(flag && flag.v) return false;
  for(const f of SEED_FOODS) await dbPut('foods', f);
  for(const p of buildSeedPlans()) await dbPut('plans', p);
  await dbPut('kv', {k:'seeded', v:1, at:Date.now()});
  return true;
}

function emptyLog(date){
  return { date, entries:[], exercises:null,
    morningWeight:null, sleepHours:null, hunger:null, fullness:null, fatigue:null,
    bowel:'', notes:'', danceMinutes:null, watchKcal:null,
    strengthMinutes:null, strengthPart:'', reportPhotoIds:[] };
}
async function getLog(date){
  const l = await dbGet('logs', date);
  return l || emptyLog(date);
}
async function saveLog(log){ await dbPut('logs', log); }

async function getPlan(date){ return await dbGet('plans', date) || null; }
async function savePlan(p){ await dbPut('plans', p); }

/* ---- 照片 ---- */
function compressImage(file, maxDim=1024, quality=0.72){
  return new Promise((res,rej)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      let {width:w, height:h} = img;
      const sc = Math.min(1, maxDim/Math.max(w,h));
      w = Math.round(w*sc); h = Math.round(h*sc);
      const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      cv.toBlob(b=> b?res(b):rej(new Error('压缩失败')), 'image/jpeg', quality);
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); rej(new Error('无法读取图片')); };
    img.src = url;
  });
}
async function addPhoto(date, kind, meal, file){
  const blob = await compressImage(file);
  const p = { id:'ph_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    date, kind, meal: meal||'', blob, ts:Date.now() };
  await dbPut('photos', p);
  return p;
}
async function photosOfDate(date){
  const all = await dbAll('photos');
  return all.filter(p=>p.date===date).sort((a,b)=>a.ts-b.ts);
}

/* ---- 备份导出 / 导入 ---- */
function blobToDataURL(blob){
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result); r.onerror = ()=>rej(r.error);
    r.readAsDataURL(blob);
  });
}
function dataURLToBlob(du){
  const [head, b64] = du.split(',');
  const mime = (head.match(/data:(.*?);/)||[])[1] || 'image/jpeg';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr], {type:mime});
}
async function exportBackup(){
  const [foods, plans, logs, photos] = await Promise.all([dbAll('foods'), dbAll('plans'), dbAll('logs'), dbAll('photos')]);
  const ph = [];
  for(const p of photos) ph.push({ ...p, blob: await blobToDataURL(p.blob) });
  return JSON.stringify({ app:'peak11', ver:1, exportedAt:new Date().toISOString(), foods, plans, logs, photos:ph });
}
async function importBackup(json){
  const d = JSON.parse(json);
  if(d.app!=='peak11') throw new Error('不是 Peak11 备份文件');
  await dbClear('foods'); await dbClear('plans'); await dbClear('logs'); await dbClear('photos');
  for(const f of d.foods||[]) await dbPut('foods', f);
  for(const p of d.plans||[]) await dbPut('plans', p);
  for(const l of d.logs||[])  await dbPut('logs', l);
  for(const p of d.photos||[]) await dbPut('photos', { ...p, blob: dataURLToBlob(p.blob) });
  await dbPut('kv', {k:'seeded', v:1, at:Date.now()});
  return { foods:(d.foods||[]).length, plans:(d.plans||[]).length, logs:(d.logs||[]).length, photos:(d.photos||[]).length };
}
