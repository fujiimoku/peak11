/* Peak 11 · 健体冲刺 — 主应用 */
'use strict';

/* ================= 工具 ================= */
const $ = (sel, el=document)=>el.querySelector(sel);
const $$ = (sel, el=document)=>[...el.querySelectorAll(sel)];
const WEEK = ['周日','周一','周二','周三','周四','周五','周六'];
const r1 = x=>Math.round(x*10)/10;
const r0 = x=>Math.round(x);
function fmt(x, d=1){ if(x==null||isNaN(x)) return '–'; return (Math.round(x*10**d)/10**d).toString(); }
function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function addDays(ds, n){ const d=new Date(ds+'T12:00:00'); d.setDate(d.getDate()+n);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function weekdayCN(ds){ return WEEK[new Date(ds+'T12:00:00').getDay()]; }
function daysToComp(ds){ return Math.round((new Date(COMP_DATE+'T12:00:00') - new Date(ds+'T12:00:00'))/86400000); }
function esc(s){ return String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function toast(msg){
  const t = document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.classList.add('show'), 10);
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(), 300); }, 2200);
}

/* ================= 营养计算 ================= */
function calcFood(food, amount){
  const k = amount / food.per;
  return { kcal:food.kcal*k, p:food.p*k, c:food.c*k, f:food.f*k,
    fiber:(food.fiber||0)*k, na:(food.na||0)*k };
}
function entryFromFood(food, amount, meal){
  const m = calcFood(food, amount);
  return { id:'e_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    meal, foodId:food.id, name:food.name, amount, unit:food.unit,
    kcal:m.kcal, p:m.p, c:m.c, f:m.f, fiber:m.fiber, na:m.na,
    estimated: food.source!=='label', tag:food.tag||'' };
}
function sumEntries(entries){
  const s = {kcal:0,p:0,c:0,f:0,fiber:0,na:0};
  for(const e of entries){ s.kcal+=e.kcal; s.p+=e.p; s.c+=e.c; s.f+=e.f; s.fiber+=e.fiber||0; s.na+=e.na||0; }
  return s;
}
function planItemMacros(item, foods){
  if(item.custom) return { kcal:item.kcal||0, p:item.p||0, c:item.c||0, f:item.f||0 };
  const f = foods.find(x=>x.id===item.foodId);
  return f ? calcFood(f, item.amount) : {kcal:0,p:0,c:0,f:0};
}

/* ================= 全局状态 ================= */
const S = { date: todayStr(), tab: 'today', foods: [], plan: null, log: null, photos: [], photoURLs: new Map() };
window.S = S;
if(S.date < '2026-11-12' || S.date > '2026-11-22'){ /* 超出冲刺区间也允许使用，默认定位到区间内 */
  if(S.date < '2026-11-12') S.date = '2026-11-12';
}

async function loadDate(date){
  S.date = date;
  S.foods = await dbAll('foods');
  S.plan = await getPlan(date);
  S.log = await getLog(date);
  // 初始化训练实际记录
  if(!S.log.exercises && S.plan && S.plan.exercises.length){
    S.log.exercises = S.plan.exercises.map(e=>({name:e.name, scheme:e.scheme, done:false, actual:'', note:''}));
  }
  for(const url of S.photoURLs.values()) URL.revokeObjectURL(url);
  S.photoURLs.clear();
  S.photos = await photosOfDate(date);
  for(const p of S.photos) S.photoURLs.set(p.id, URL.createObjectURL(p.blob));
}
async function persistLog(){ await saveLog(S.log); }
async function reload(){ await loadDate(S.date); render(); }

/* ================= Sheet 弹层 ================= */
function openSheet(html, cls=''){
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg"></div><div class="sheet ${cls}">${html}</div>`;
  wrap.querySelector('.sheet-bg').onclick = closeSheet;
  document.body.appendChild(wrap);
  return wrap;
}
function closeSheet(){ $$('.sheet-wrap').forEach(e=>e.remove()); }

/* ================= 页面渲染 ================= */
function render(){
  $$('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.tab===S.tab));
  const main = $('#main');
  if(S.tab==='today') main.innerHTML = viewToday();
  else if(S.tab==='record') main.innerHTML = viewRecord();
  else if(S.tab==='trend'){ main.innerHTML = viewTrend(); requestAnimationFrame(drawTrendCharts); }
  else main.innerHTML = viewReport();
  bindMain();
}

function dateBar(){
  const d = S.date, n = daysToComp(d);
  return `<div class="datebar">
    <button class="dnav" data-act="date-prev">‹</button>
    <div class="datemid" data-act="date-pick">
      <div class="dateline">${d} ${weekdayCN(d)}</div>
      <div class="cdline">${n>0?`距比赛 <b>${n}</b> 天`:(n===0?'<b>比赛日 🏆</b>':`比赛已过 ${-n} 天`)}</div>
      <input type="date" id="datePick" value="${d}" min="2026-11-01" max="2026-12-05">
    </div>
    <button class="dnav" data-act="date-next">›</button>
  </div>`;
}

function progressRow(label, actual, target, unit){
  const pct = target>0 ? Math.min(100, actual/target*100) : 0;
  const over = target>0 && actual>target*1.03;
  return `<div class="prow">
    <div class="plabel">${label}</div>
    <div class="pbar"><div class="pfill ${over?'over':''}" style="width:${pct.toFixed(1)}%"></div></div>
    <div class="pnum"><b>${r0(actual)}</b> / ${r0(target)}${unit}</div>
  </div>`;
}

/* ---------- 页面1：今日 ---------- */
function viewToday(){
  const plan = S.plan, log = S.log;
  const total = sumEntries(log.entries);
  const prevLog = S._prevLog;
  let wHtml = '–';
  if(log.morningWeight!=null){
    wHtml = `<b>${fmt(log.morningWeight)}</b> kg`;
    if(prevLog && prevLog.morningWeight!=null){
      const d = log.morningWeight - prevLog.morningWeight;
      const cls = d>0?'up':(d<0?'down':'');
      wHtml += ` <span class="wdelta ${cls}">${d>=0?'+':''}${fmt(d,2)}</span>`;
    }
  } else wHtml = '<span class="muted">未记录</span> <span class="linklike" data-act="edit-body">去记录 ›</span>';

  let html = dateBar();
  if(!plan){
    html += `<div class="card">这一天没有预设计划（冲刺区间为 11-12 至 11-22）。仍可在「记录」页记录饮食与身体数据。</div>`;
  } else {
    html += `<div class="card typecard"><span class="typebadge">${esc(plan.type)}</span>
      <div><div class="tpl">${esc(plan.tplLabel)}</div>
      ${plan.special?`<div class="small muted">${esc(plan.specialNote)}</div>`:''}</div></div>`;
  }
  html += `<div class="card"><div class="cardtitle">今晨体重</div><div class="bignum">${wHtml}</div></div>`;

  if(plan){
    html += `<div class="card"><div class="cardtitle">今日营养 <span class="small muted">实际 / 目标</span></div>
      ${progressRow('热量', total.kcal, plan.kcal, ' kcal')}
      ${progressRow('碳水', total.c, plan.targets.c, 'g')}
      ${progressRow('蛋白', total.p, plan.targets.p, 'g')}
      ${progressRow('脂肪', total.f, plan.targets.f, 'g')}
      ${estimatedNote(log.entries)}
    </div>`;
    // 餐次卡片
    for(const mk of MEAL_KEYS){
      const items = plan.meals[mk]||[];
      const eaten = log.entries.filter(e=>e.meal===mk);
      const es = sumEntries(eaten);
      if(!items.length && !eaten.length) continue;
      html += `<div class="card mealcard" data-meal="${mk}">
        <div class="mealhead"><div class="cardtitle">${esc(plan.mealNames[mk])}</div>
          ${items.length?`<button class="btn small-btn" data-act="eat-all" data-meal="${mk}">✓ 已吃(按计划)</button>`:''}
        </div>`;
      if(items.length){
        html += `<div class="sub">计划（不计入摄入统计）</div>`;
        items.forEach((it,idx)=>{
          const f = S.foods.find(x=>x.id===it.foodId);
          const m = planItemMacros(it, S.foods);
          const name = it.custom? it.name : (f? f.name : it.foodId);
          const unit = it.custom? (it.unit||'g') : (f? f.unit : 'g');
          html += `<div class="fooditem plan" data-act="plan-item" data-meal="${mk}" data-idx="${idx}">
            <span class="fname">${esc(name)}</span>
            <span class="famt">${fmt(it.amount)}${unit}</span>
            <span class="fkcal muted">${r0(m.kcal)} kcal</span></div>`;
        });
        html += `<div class="linklike small" data-act="plan-add" data-meal="${mk}">＋ 编辑计划 / 添加食物</div>`;
      }
      if(eaten.length){
        html += `<div class="sub eaten-sub">已吃 · ${r0(es.kcal)} kcal · 碳${r0(es.c)} 蛋${r0(es.p)} 脂${r0(es.f)}</div>`;
        eaten.forEach(e=>{
          html += `<div class="fooditem eaten" data-act="entry-edit" data-eid="${e.id}">
            <span class="fname">✓ ${esc(e.name)}${e.estimated?'<span class="estmark">估</span>':''}</span>
            <span class="famt">${fmt(e.amount)}${e.unit}</span>
            <span class="fkcal">${r0(e.kcal)} kcal</span></div>`;
        });
      }
      html += `</div>`;
    }
    // 训练卡
    html += `<div class="card"><div class="cardtitle">今日训练</div>
      <div class="traintitle">${esc(plan.trainingTitle)}</div>`;
    const exs = log.exercises||[];
    if(exs.length){
      exs.forEach((ex,i)=>{
        html += `<div class="exrow">
          <label class="exchk"><input type="checkbox" data-act="ex-done" data-i="${i}" ${ex.done?'checked':''}>
          <span class="${ex.done?'exdone':''}">${esc(ex.name)} <span class="muted small">${esc(ex.scheme||'')}</span></span></label>
          <button class="minibtn" data-act="ex-edit" data-i="${i}">${ex.actual?'✎':'记录'}</button>
        </div>
        ${ex.actual?`<div class="exactual">实际：${esc(ex.actual)}${ex.note?' · '+esc(ex.note):''}</div>`:''}`;
      });
      const doneN = exs.filter(e=>e.done).length;
      html += `<div class="small muted" style="margin-top:6px">完成 ${doneN}/${exs.length}${log.strengthMinutes?` · 实际时长 ${log.strengthMinutes} 分钟`:''}</div>`;
    } else html += `<div class="small muted">今日无力量训练安排</div>`;
    html += `</div>`;
  }
  html += `<div class="bigbtns">
    <button class="btn primary big" data-act="goto-record">🍚 记录食物</button>
    <button class="btn accent big" data-act="goto-report">📄 生成今日汇报</button>
  </div>`;
  return html;
}
function estimatedNote(entries){
  const est = entries.filter(e=>e.estimated);
  if(!entries.length) return `<div class="small muted">今天还没有记录摄入。计划不会自动计入统计。</div>`;
  if(!est.length) return `<div class="small okline">✓ 全部为商品标签数据</div>`;
  const names = [...new Set(est.map(e=>e.name))].slice(0,5).join('、');
  return `<div class="small muted">含估算项 ${est.length} 条（${esc(names)}${est.length>5?'…':''}），存在估算误差。</div>`;
}

/* ---------- 页面2：记录 ---------- */
function viewRecord(){
  let html = dateBar();
  html += `<div class="card"><div class="cardtitle">快速添加食物</div>
    <input class="input" id="foodSearch" placeholder="搜索食物库…" autocomplete="off">
    <div id="foodList" class="foodlist">${foodListHTML('')}</div></div>`;
  html += `<div class="card"><div class="cardtitle">⚖️ 前后称重计算器</div>
    <div class="small muted">适合米饭等：称吃前和吃后的重量</div>
    <div class="formrow"><input class="input half" id="wcBefore" type="number" inputmode="decimal" step="0.1" placeholder="原始重量 g">
    <input class="input half" id="wcAfter" type="number" inputmode="decimal" step="0.1" placeholder="剩余重量 g"></div>
    <div id="wcResult" class="calcresult"></div>
    <button class="btn primary" data-act="wc-add">计算并添加到记录</button></div>`;
  html += `<div class="card"><div class="cardtitle">🍌 香蕉去皮计算器</div>
    <div class="formrow"><input class="input half" id="bnTotal" type="number" inputmode="decimal" step="0.1" placeholder="带皮总重 g">
    <input class="input half" id="bnPeel" type="number" inputmode="decimal" step="0.1" placeholder="香蕉皮重 g"></div>
    <div id="bnResult" class="calcresult"></div>
    <button class="btn primary" data-act="bn-add">计算可食部分并添加</button></div>`;
  html += `<div class="card"><div class="cardtitle">📝 自定义食物</div>
    <button class="btn" data-act="custom-food">手工填写营养信息（可拍标签）</button></div>`;
  html += `<div class="card"><div class="cardtitle">📷 食物照片</div>
    <div class="formrow">
      <select class="input half" id="photoMeal">${MEAL_KEYS.map(k=>`<option value="${k}">${(S.plan?S.plan.mealNames[k]:MEAL_NAMES_DEFAULT[k])}</option>`).join('')}<option value="">当天(不绑定餐次)</option></select>
      <label class="btn half filebtn">拍照/选图<input type="file" id="mealPhotoInput" accept="image/*" hidden></label>
    </div>
    ${photoStripHTML(['food','label'])}</div>`;
  html += `<div class="card"><div class="cardtitle">🏋️ 运动与身体记录</div>
    ${bodyFormHTML()}
    <div class="formrow" style="margin-top:8px">
      <label class="btn half filebtn">训练截图<input type="file" id="trainPhotoInput" accept="image/*" hidden></label>
      <label class="btn half filebtn">体型照片<input type="file" id="physiquePhotoInput" accept="image/*" hidden></label>
    </div>
    ${photoStripHTML(['training','physique'])}</div>`;
  return html;
}
function foodListHTML(q){
  const list = S.foods.filter(f=>!q || f.name.toLowerCase().includes(q.toLowerCase()));
  return list.map(f=>`<div class="fooditem" data-act="food-add" data-fid="${f.id}">
    <span class="fname">${esc(f.name)}${f.source==='est'?'<span class="estmark">估</span>':'<span class="lblmark">标签</span>'}</span>
    <span class="muted small">${f.per===1?`每${f.unit}`:`每100${f.unit}`} ${f.kcal}kcal</span>
    <span class="addplus">＋</span></div>`).join('') || '<div class="muted small">没有匹配的食物，可用下方「自定义食物」添加。</div>';
}
function photoStripHTML(kinds){
  const ps = S.photos.filter(p=>kinds.includes(p.kind));
  if(!ps.length) return `<div class="small muted">暂无照片</div>`;
  return `<div class="photostrip">${ps.map(p=>`<div class="thumbwrap">
    <img class="thumb" src="${S.photoURLs.get(p.id)}" data-act="photo-view" data-pid="${p.id}">
    <button class="thumbdel" data-act="photo-del" data-pid="${p.id}">×</button></div>`).join('')}</div>`;
}
function scaleInput(id, label, val){
  return `<div class="scalerow"><span class="plabel">${label}</span>
    <div class="scalebtns">${[1,2,3,4,5].map(n=>`<button class="scalebtn ${val===n?'sel':''}" data-act="scale" data-id="${id}" data-v="${n}">${n}</button>`).join('')}</div></div>`;
}
function bodyFormHTML(){
  const l = S.log;
  return `<div class="formgrid">
    <label>晨重 kg<input class="input" id="bfWeight" type="number" inputmode="decimal" step="0.05" value="${l.morningWeight??''}" placeholder="如 72.3"></label>
    <label>睡眠 小时<input class="input" id="bfSleep" type="number" inputmode="decimal" step="0.5" value="${l.sleepHours??''}" placeholder="如 8"></label>
    <label>力量训练 分钟<input class="input" id="bfStrength" type="number" inputmode="numeric" value="${l.strengthMinutes??''}" placeholder="实际时长"></label>
    <label>训练部位<input class="input" id="bfPart" value="${esc(l.strengthPart||'')}" placeholder="如 背"></label>
    <label>舞蹈排练 分钟<input class="input" id="bfDance" type="number" inputmode="numeric" value="${l.danceMinutes??''}"></label>
    <label>手表动态千卡 <span class="small muted">仅参考</span><input class="input" id="bfWatch" type="number" inputmode="numeric" value="${l.watchKcal??''}"></label>
  </div>
  ${scaleInput('hunger','饥饿程度', l.hunger)}
  ${scaleInput('fullness','肌肉饱满', l.fullness)}
  ${scaleInput('fatigue','疲劳程度', l.fatigue)}
  <label class="fulllabel">排便 / 腹胀<input class="input" id="bfBowel" value="${esc(l.bowel||'')}" placeholder="如 正常，无腹胀"></label>
  <label class="fulllabel">当日备注<textarea class="input" id="bfNotes" rows="2" placeholder="其他情况…">${esc(l.notes||'')}</textarea></label>
  <button class="btn primary" data-act="body-save">保存身体记录</button>`;
}

/* ---------- 页面3：趋势 ---------- */
function viewTrend(){
  return `<div class="pagehead">趋势 · 11-12 至 11-22</div>
  <div class="card"><div class="cardtitle">每日晨重 (kg)</div><canvas id="cvWeight" class="chart"></canvas>
    <div class="small muted">单日波动受水分、钠、糖原、消化道内容物影响，不代表脂肪增减。</div></div>
  <div class="card"><div class="cardtitle">每日摄入热量 (kcal)</div><canvas id="cvKcal" class="chart"></canvas></div>
  <div class="card"><div class="cardtitle">三大营养素 · 实际 vs 目标</div><canvas id="cvMacro" class="chart tall"></canvas>
    <div class="small muted">实心=实际，边框=目标。碳水/蛋白/脂肪。</div></div>
  <div class="card"><div class="cardtitle">时间线</div><div id="timeline"></div></div>`;
}
async function drawTrendCharts(){
  const dates = []; for(let d='2026-11-12'; d<=COMP_DATE; d=addDays(d,1)) dates.push(d);
  const logs = {}, plans = {};
  for(const d of dates){ logs[d] = await dbGet('logs', d); plans[d] = await getPlan(d); }
  const labels = dates.map(d=>d.slice(8));
  const dpr = window.devicePixelRatio||1;
  function setup(id, h=180){
    const cv = $(id); if(!cv) return null;
    const w = cv.parentElement.clientWidth - 8;
    cv.width = w*dpr; cv.height = h*dpr; cv.style.width=w+'px'; cv.style.height=h+'px';
    const ctx = cv.getContext('2d'); ctx.scale(dpr,dpr);
    return {ctx, w, h};
  }
  const PURPLE='#7c5cbf', GRAY='#8a8a95', LIGHT='#e8e3f3';
  // 体重折线
  let c = setup('#cvWeight');
  if(c){
    const vals = dates.map(d=>logs[d]?.morningWeight ?? null);
    const nums = vals.filter(v=>v!=null);
    const {ctx,w,h} = c; const pad={l:34,r:8,t:12,b:20};
    ctx.font='10px -apple-system,sans-serif'; ctx.fillStyle=GRAY;
    if(!nums.length){ ctx.fillText('暂无体重记录', 20, 40); }
    else{
      const lo=Math.min(...nums)-0.4, hi=Math.max(...nums)+0.4;
      const x=i=>pad.l+(w-pad.l-pad.r)*(i/(dates.length-1));
      const y=v=>pad.t+(h-pad.t-pad.b)*(1-(v-lo)/(hi-lo));
      ctx.strokeStyle=LIGHT; ctx.beginPath();
      for(let g=0;g<=3;g++){ const gy=pad.t+(h-pad.t-pad.b)*g/3; ctx.moveTo(pad.l,gy); ctx.lineTo(w-pad.r,gy);
        ctx.fillText((hi-(hi-lo)*g/3).toFixed(1), 2, gy+3); }
      ctx.stroke();
      ctx.strokeStyle=PURPLE; ctx.lineWidth=2; ctx.beginPath(); let started=false;
      vals.forEach((v,i)=>{ if(v==null) return; if(!started){ctx.moveTo(x(i),y(v)); started=true;} else ctx.lineTo(x(i),y(v)); });
      ctx.stroke();
      ctx.fillStyle=PURPLE;
      vals.forEach((v,i)=>{ if(v==null) return; ctx.beginPath(); ctx.arc(x(i),y(v),3,0,7); ctx.fill();
        ctx.fillStyle='#555'; ctx.fillText(v.toFixed(1), x(i)-10, y(v)-7); ctx.fillStyle=PURPLE; });
      ctx.fillStyle=GRAY; labels.forEach((L,i)=>ctx.fillText(L, x(i)-6, h-5));
    }
  }
  // 热量柱状
  c = setup('#cvKcal');
  if(c){
    const {ctx,w,h} = c; const pad={l:36,r:8,t:12,b:20};
    const act = dates.map(d=> logs[d]? sumEntries(logs[d].entries).kcal : 0);
    const tgt = dates.map(d=> plans[d]? plans[d].kcal : 0);
    const hi = Math.max(1, ...act, ...tgt)*1.1;
    const bw = (w-pad.l-pad.r)/dates.length;
    const y=v=>pad.t+(h-pad.t-pad.b)*(1-v/hi);
    ctx.font='10px -apple-system,sans-serif';
    ctx.strokeStyle=LIGHT; ctx.fillStyle=GRAY; ctx.beginPath();
    for(let g=0;g<=3;g++){ const gv=hi*g/3, gy=y(gv); ctx.moveTo(pad.l,gy); ctx.lineTo(w-pad.r,gy); ctx.fillText(String(r0(gv)), 2, gy+3); }
    ctx.stroke();
    dates.forEach((d,i)=>{
      const x0 = pad.l+bw*i+bw*0.18;
      if(tgt[i]){ ctx.strokeStyle=GRAY; ctx.setLineDash([3,2]); ctx.beginPath(); ctx.moveTo(x0-2,y(tgt[i])); ctx.lineTo(x0+bw*0.64+2,y(tgt[i])); ctx.stroke(); ctx.setLineDash([]); }
      if(act[i]>0){ ctx.fillStyle=PURPLE; ctx.fillRect(x0, y(act[i]), bw*0.64, h-pad.b-y(act[i])); }
      ctx.fillStyle=GRAY; ctx.fillText(labels[i], pad.l+bw*i+bw*0.2, h-5);
    });
  }
  // 宏量对比
  c = setup('#cvMacro', 230);
  if(c){
    const {ctx,w,h} = c; const rows=[['碳水','c'],['蛋白','p'],['脂肪','f']];
    const pad={l:34,r:8,t:8,b:16}; const rh=(h-pad.t-pad.b)/3;
    ctx.font='10px -apple-system,sans-serif';
    rows.forEach(([lab,key],ri)=>{
      const top = pad.t+rh*ri;
      const act = dates.map(d=> logs[d]? sumEntries(logs[d].entries)[key] : 0);
      const tgt = dates.map(d=> plans[d]? plans[d].targets[key] : 0);
      const hi = Math.max(1, ...act, ...tgt)*1.15;
      const bw = (w-pad.l-pad.r)/dates.length;
      const y=v=>top+ (rh-18)*(1-v/hi) + 4;
      ctx.fillStyle='#555'; ctx.fillText(lab, 2, top+rh/2);
      dates.forEach((d,i)=>{
        const x0 = pad.l+bw*i+bw*0.15;
        if(tgt[i]){ ctx.strokeStyle='#b7a6dd'; ctx.strokeRect(x0, y(tgt[i]), bw*0.7, top+rh-14-y(tgt[i])); }
        if(act[i]>0){ ctx.fillStyle='rgba(124,92,191,.75)'; ctx.fillRect(x0+1, y(act[i]), bw*0.7-2, top+rh-14-y(act[i])); }
        if(ri===2){ ctx.fillStyle=GRAY; ctx.fillText(labels[i], pad.l+bw*i+bw*0.18, h-3); }
      });
    });
  }
  // 时间线
  const tl = $('#timeline');
  if(tl){
    tl.innerHTML = dates.map(d=>{
      const p = plans[d], l = logs[d];
      const exs = l?.exercises||[]; const doneN = exs.filter(e=>e.done).length;
      const trained = exs.length ? (doneN>0?`✅ ${doneN}/${exs.length} 动作`:'⬜ 未打卡') : '—';
      const kc = l && l.entries.length ? r0(sumEntries(l.entries).kcal)+' kcal' : '未记录';
      return `<div class="tlrow ${d===S.date?'cur':''}" data-act="tl-goto" data-date="${d}">
        <span class="tldate">${d.slice(5)} ${weekdayCN(d)}</span>
        <span class="tltype">${p?esc(p.type):''}</span>
        <span class="tlw">${l?.morningWeight?fmt(l.morningWeight)+'kg':'–'}</span>
        <span class="tlk small">${kc}</span>
        <span class="tlt small">${trained}</span></div>`;
    }).join('');
  }
}

/* ---------- 页面4：日报与设置 ---------- */
function viewReport(){
  const ps = S.photos;
  const sel = S.log.reportPhotoIds||[];
  return `${dateBar()}
  <div class="card"><div class="cardtitle">今日汇报</div>
    <div class="small muted">报告只包含「实际已记录」的数据，计划中未吃的食物不会出现；未填写的内容显示为「未记录」。</div>
    ${ps.length?`<div class="sub">选择最多4张照片放入日报（${sel.length}/4）</div>
    <div class="photostrip">${ps.map(p=>`<div class="thumbwrap ${sel.includes(p.id)?'selth':''}">
      <img class="thumb" src="${S.photoURLs.get(p.id)}" data-act="report-photo-toggle" data-pid="${p.id}">
      ${sel.includes(p.id)?'<span class="selmark">✓</span>':''}</div>`).join('')}</div>`:'<div class="small muted">今天还没有照片。</div>'}
    <div class="bigbtns">
      <button class="btn accent big" data-act="gen-png">🖼 生成日报长图 PNG</button>
      <button class="btn primary big" data-act="copy-md">📋 复制日报文字 (Markdown)</button>
    </div>
    <div id="reportOut"></div>
  </div>
  <div class="card"><div class="cardtitle">数据备份</div>
    <div class="bigbtns">
      <button class="btn" data-act="export-json">⬇️ 导出 JSON 备份</button>
      <label class="btn filebtn">⬆️ 导入 JSON 恢复<input type="file" id="importInput" accept=".json,application/json" hidden></label>
    </div>
    <div class="small muted">更换设备或清理浏览器数据前，请先导出备份保存到「文件」或发给自己。</div></div>
  <div class="card"><div class="cardtitle">食物数据库</div>
    <button class="btn" data-act="food-db">管理食物库（${S.foods.length} 项）</button></div>
  <div class="card"><div class="cardtitle">使用说明</div>
    <div class="small">
    1. 在 Safari 打开本站 → 分享按钮 → 「添加到主屏幕」即可像App一样使用，支持离线。<br>
    2. 每晚流程：录晨重与身体状态 → 核对已吃记录 → 选照片 → 生成长图 → 保存/分享到 ChatGPT 对话，同时可复制 Markdown 文字版。<br>
    3. 数据保存在本机浏览器中，请定期导出 JSON 备份。</div></div>`;
}

/* ================= 事件 ================= */
function bindMain(){
  const main = $('#main');
  const dp = $('#datePick');
  if(dp) dp.onchange = async e=>{ await loadDate(e.target.value); await loadPrev(); render(); };
  const fs = $('#foodSearch');
  if(fs) fs.oninput = ()=>{ $('#foodList').innerHTML = foodListHTML(fs.value.trim()); };
  const wcB=$('#wcBefore'), wcA=$('#wcAfter');
  if(wcB){ const upd=()=>{ const b=parseFloat(wcB.value), a=parseFloat(wcA.value);
    $('#wcResult').textContent = (!isNaN(b)&&!isNaN(a)&&b>=a) ? `已吃 ${fmt(b-a)} g` : ''; };
    wcB.oninput=upd; wcA.oninput=upd; }
  const bnT=$('#bnTotal'), bnP=$('#bnPeel');
  if(bnT){ const upd=()=>{ const t=parseFloat(bnT.value), p=parseFloat(bnP.value)||0;
    $('#bnResult').textContent = (!isNaN(t)&&t>p) ? `可食部分 ${fmt(t-p)} g` : ''; };
    bnT.oninput=upd; bnP.oninput=upd; }
  for(const [id,kind] of [['mealPhotoInput','food'],['trainPhotoInput','training'],['physiquePhotoInput','physique']]){
    const inp = $('#'+id);
    if(inp) inp.onchange = async e=>{
      const file = e.target.files[0]; if(!file) return;
      const meal = kind==='food' ? ($('#photoMeal')?.value||'') : '';
      try{ await addPhoto(S.date, kind, meal, file); toast('照片已保存'); await reload(); }
      catch(err){ toast('照片保存失败：'+err.message); }
    };
  }
  const imp = $('#importInput');
  if(imp) imp.onchange = async e=>{
    const file = e.target.files[0]; if(!file) return;
    if(!confirm('导入将覆盖当前全部数据，确定继续？')) { imp.value=''; return; }
    try{ const n = await importBackup(await file.text());
      toast(`已恢复：${n.logs}天记录 / ${n.photos}张照片`); await reload(); }
    catch(err){ toast('导入失败：'+err.message); }
  };
}

document.addEventListener('click', async e=>{
  const el = e.target.closest('[data-act]');
  if(!el) return;
  const act = el.dataset.act;
  const H = ACTIONS[act];
  if(H){ if(!el.matches('input')) e.preventDefault(); await H(el); }
});

async function loadPrev(){ S._prevLog = await dbGet('logs', addDays(S.date,-1)); }

const ACTIONS = {
  'date-prev': async()=>{ await loadDate(addDays(S.date,-1)); await loadPrev(); render(); },
  'date-next': async()=>{ await loadDate(addDays(S.date,1)); await loadPrev(); render(); },
  'date-pick': ()=>{ const dp=$('#datePick'); if(dp){ dp.showPicker?dp.showPicker():dp.click(); } },
  'goto-record': ()=>{ S.tab='record'; render(); },
  'goto-report': ()=>{ S.tab='report'; render(); },
  'tl-goto': async(el)=>{ await loadDate(el.dataset.date); await loadPrev(); S.tab='today'; render(); },
  'edit-body': ()=>{ S.tab='record'; render(); setTimeout(()=>$('#bfWeight')?.scrollIntoView({block:'center'}),50); },

  /* 整餐已吃 */
  'eat-all': async(el)=>{
    const mk = el.dataset.meal;
    const items = S.plan.meals[mk]||[];
    let n=0;
    for(const it of items){
      if(it.custom){ S.log.entries.push({ id:'e_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
        meal:mk, name:it.name, amount:it.amount, unit:it.unit||'g',
        kcal:it.kcal||0, p:it.p||0, c:it.c||0, f:it.f||0, fiber:it.fiber||0, na:it.na||0, estimated:true, tag:'' }); n++; continue; }
      const f = S.foods.find(x=>x.id===it.foodId); if(!f) continue;
      S.log.entries.push(entryFromFood(f, it.amount, mk)); n++;
    }
    await persistLog(); toast(`已记录 ${n} 项为已吃`); render();
  },

  /* 计划项：编辑计划 / 按量记已吃 */
  'plan-item': (el)=>{
    const mk = el.dataset.meal, idx = +el.dataset.idx;
    const it = S.plan.meals[mk][idx];
    const f = it.custom? null : S.foods.find(x=>x.id===it.foodId);
    const name = it.custom? it.name : (f?f.name:'');
    const unit = it.custom? (it.unit||'g') : (f?f.unit:'g');
    const w = openSheet(`<div class="sheettitle">${esc(name)} <span class="muted small">${f&&f.tag?f.tag:''}</span></div>
      <label>数量（${unit}）<input class="input" id="shAmt" type="number" inputmode="decimal" step="0.1" value="${it.amount}"></label>
      <div class="bigbtns">
        <button class="btn primary" id="shEat">✓ 按此数量记为已吃</button>
        <button class="btn" id="shSavePlan">保存到计划</button>
        <button class="btn danger" id="shDelPlan">从计划移除</button>
      </div>`);
    $('#shEat',w).onclick = async()=>{
      const amt = parseFloat($('#shAmt',w).value); if(isNaN(amt)||amt<=0) return toast('请输入有效数量');
      if(f) S.log.entries.push(entryFromFood(f, amt, mk));
      else { const k = amt/(it.amount||1); S.log.entries.push({ id:'e_'+Date.now(), meal:mk, name:it.name, amount:amt, unit, kcal:(it.kcal||0)*k, p:(it.p||0)*k, c:(it.c||0)*k, f:(it.f||0)*k, estimated:true }); }
      await persistLog(); closeSheet(); toast('已记录'); render();
    };
    $('#shSavePlan',w).onclick = async()=>{
      const amt = parseFloat($('#shAmt',w).value); if(isNaN(amt)||amt<=0) return toast('请输入有效数量');
      it.amount = amt; await savePlan(S.plan); closeSheet(); toast('计划已更新'); render();
    };
    $('#shDelPlan',w).onclick = async()=>{
      S.plan.meals[mk].splice(idx,1); await savePlan(S.plan); closeSheet(); toast('已从计划移除'); render();
    };
  },
  'plan-add': (el)=>{
    const mk = el.dataset.meal;
    const w = openSheet(`<div class="sheettitle">向「${esc(S.plan.mealNames[mk])}」计划添加食物</div>
      <input class="input" id="shSearch" placeholder="搜索食物…">
      <div class="foodlist" id="shList"></div>`);
    const renderList = q=>{
      $('#shList',w).innerHTML = S.foods.filter(f=>!q||f.name.includes(q)).map(f=>
        `<div class="fooditem" data-fid="${f.id}"><span class="fname">${esc(f.name)}</span><span class="muted small">默认${f.def}${f.unit}</span><span class="addplus">＋</span></div>`).join('');
      $$('#shList .fooditem',w).forEach(it=>it.onclick=async()=>{
        const f = S.foods.find(x=>x.id===it.dataset.fid);
        const amt = parseFloat(prompt(`数量（${f.unit}）`, f.def)); if(isNaN(amt)||amt<=0) return;
        S.plan.meals[mk].push({foodId:f.id, amount:amt});
        await savePlan(S.plan); closeSheet(); toast('已加入计划'); render();
      });
    };
    renderList('');
    $('#shSearch',w).oninput = e=>renderList(e.target.value.trim());
  },

  /* 已吃条目：改量/删除 */
  'entry-edit': (el)=>{
    const en = S.log.entries.find(x=>x.id===el.dataset.eid); if(!en) return;
    const w = openSheet(`<div class="sheettitle">${esc(en.name)}</div>
      <label>实际数量（${en.unit}）<input class="input" id="shAmt" type="number" inputmode="decimal" step="0.1" value="${r1(en.amount)}"></label>
      <div class="small muted" id="shPreview"></div>
      <div class="bigbtns"><button class="btn primary" id="shSave">保存修改</button>
      <button class="btn danger" id="shDel">删除这条记录</button></div>`);
    const f = en.foodId ? S.foods.find(x=>x.id===en.foodId) : null;
    const preview = ()=>{
      const amt = parseFloat($('#shAmt',w).value); if(isNaN(amt)) return;
      let m;
      if(f) m = calcFood(f, amt); else { const k=amt/en.amount; m={kcal:en.kcal*k,p:en.p*k,c:en.c*k,f:en.f*k}; }
      $('#shPreview',w).textContent = `${r0(m.kcal)} kcal · 碳${fmt(m.c)} 蛋${fmt(m.p)} 脂${fmt(m.f)}`;
    };
    preview(); $('#shAmt',w).oninput = preview;
    $('#shSave',w).onclick = async()=>{
      const amt = parseFloat($('#shAmt',w).value); if(isNaN(amt)||amt<=0) return toast('请输入有效数量');
      if(f){ const m = calcFood(f, amt); Object.assign(en, {amount:amt, kcal:m.kcal,p:m.p,c:m.c,f:m.f,fiber:m.fiber,na:m.na}); }
      else { const k = amt/en.amount; Object.assign(en, {amount:amt, kcal:en.kcal*k,p:en.p*k,c:en.c*k,f:en.f*k,fiber:(en.fiber||0)*k,na:(en.na||0)*k}); }
      await persistLog(); closeSheet(); toast('已更新'); render();
    };
    $('#shDel',w).onclick = async()=>{
      S.log.entries = S.log.entries.filter(x=>x.id!==en.id);
      await persistLog(); closeSheet(); toast('已删除'); render();
    };
  },

  /* 快速添加 */
  'food-add': (el)=>{
    const f = S.foods.find(x=>x.id===el.dataset.fid); if(!f) return;
    addFoodSheet(f);
  },

  /* 称重差值 */
  'wc-add': ()=>{
    const b = parseFloat($('#wcBefore').value), a = parseFloat($('#wcAfter').value);
    if(isNaN(b)||isNaN(a)||b<a) return toast('请输入有效的原始/剩余重量');
    pickFoodForAmount(r1(b-a), `已吃 ${fmt(b-a)} g，选择对应食物`);
  },
  'bn-add': ()=>{
    const t = parseFloat($('#bnTotal').value), p = parseFloat($('#bnPeel').value)||0;
    if(isNaN(t)||t<=p) return toast('请输入有效的带皮重量');
    const f = S.foods.find(x=>x.id==='banana');
    addFoodSheet(f, r1(t-p));
  },

  /* 自定义食物 */
  'custom-food': ()=>{
    const w = openSheet(`<div class="sheettitle">自定义食物</div>
      <div class="formgrid">
      <label>名称<input class="input" id="cfName" placeholder="如 食堂红烧鱼"></label>
      <label>单位<select class="input" id="cfUnit"><option>g</option><option>ml</option><option>个</option><option>袋</option><option>盒</option></select></label>
      <label>本次份量<input class="input" id="cfAmt" type="number" inputmode="decimal" value="100"></label>
      <label>该份量热量 kcal<input class="input" id="cfKcal" type="number" inputmode="decimal"></label>
      <label>蛋白质 g<input class="input" id="cfP" type="number" inputmode="decimal"></label>
      <label>碳水 g<input class="input" id="cfC" type="number" inputmode="decimal"></label>
      <label>脂肪 g<input class="input" id="cfF" type="number" inputmode="decimal"></label>
      <label>膳食纤维 g 可选<input class="input" id="cfFib" type="number" inputmode="decimal"></label>
      <label>钠 mg 可选<input class="input" id="cfNa" type="number" inputmode="decimal"></label>
      <label>餐次<select class="input" id="cfMeal">${MEAL_KEYS.map(k=>`<option value="${k}">${S.plan?S.plan.mealNames[k]:MEAL_NAMES_DEFAULT[k]}</option>`).join('')}</select></label>
      </div>
      <label class="chkline"><input type="checkbox" id="cfSaveDB" checked> 同时保存到食物数据库（按每100${'g'}/每单位换算）</label>
      <label class="btn filebtn">📷 拍营养标签(可选)<input type="file" id="cfPhoto" accept="image/*" hidden></label>
      <div id="cfPhotoHint" class="small muted"></div>
      <div class="bigbtns"><button class="btn primary big" id="cfAdd">添加到今日记录</button></div>`);
    let labelFile = null;
    $('#cfPhoto',w).onchange = e=>{ labelFile = e.target.files[0]; $('#cfPhotoHint',w).textContent = labelFile?('已选择：'+labelFile.name):''; };
    $('#cfAdd',w).onclick = async()=>{
      const name = $('#cfName',w).value.trim(); if(!name) return toast('请填写名称');
      const unit = $('#cfUnit',w).value;
      const amt = parseFloat($('#cfAmt',w).value)||0; if(amt<=0) return toast('请填写份量');
      const kcal = parseFloat($('#cfKcal',w).value)||0, p=parseFloat($('#cfP',w).value)||0,
        cc=parseFloat($('#cfC',w).value)||0, ff=parseFloat($('#cfF',w).value)||0,
        fib=parseFloat($('#cfFib',w).value)||0, na=parseFloat($('#cfNa',w).value)||0;
      const meal = $('#cfMeal',w).value;
      let foodId = null;
      if($('#cfSaveDB',w).checked){
        const per = (unit==='g'||unit==='ml') ? 100 : 1;
        const k = per/amt;
        const food = { id:'cf_'+Date.now(), name, unit, per,
          kcal:r1(kcal*k), p:r1(p*k), c:r1(cc*k), f:r1(ff*k),
          fiber:fib?r1(fib*k):undefined, na:na?r0(na*k):undefined,
          source:'label', def: (unit==='g'||unit==='ml')? amt : 1, custom:true };
        await dbPut('foods', food); foodId = food.id;
      }
      S.log.entries.push({ id:'e_'+Date.now(), meal, foodId, name, amount:amt, unit,
        kcal, p, c:cc, f:ff, fiber:fib, na, estimated:false, tag:'' });
      await persistLog();
      if(labelFile){ try{ await addPhoto(S.date, 'label', meal, labelFile); }catch(e){} }
      closeSheet(); toast('已添加'); await reload();
    };
  },

  /* 身体记录 */
  'scale': (el)=>{
    const map = {hunger:'hunger', fullness:'fullness', fatigue:'fatigue'};
    S.log[map[el.dataset.id]] = +el.dataset.v;
    el.closest('.scalebtns').querySelectorAll('.scalebtn').forEach(b=>b.classList.toggle('sel', b===el));
  },
  'body-save': async()=>{
    const num = id=>{ const v = $('#'+id).value.trim(); return v===''? null : parseFloat(v); };
    S.log.morningWeight = num('bfWeight');
    S.log.sleepHours = num('bfSleep');
    S.log.strengthMinutes = num('bfStrength');
    S.log.strengthPart = $('#bfPart').value.trim();
    S.log.danceMinutes = num('bfDance');
    S.log.watchKcal = num('bfWatch');
    S.log.bowel = $('#bfBowel').value.trim();
    S.log.notes = $('#bfNotes').value.trim();
    await persistLog(); toast('身体记录已保存');
  },

  /* 训练 */
  'ex-done': async(el)=>{
    S.log.exercises[+el.dataset.i].done = !!el.checked;
    await persistLog(); render();
  },
  'ex-edit': (el)=>{
    const ex = S.log.exercises[+el.dataset.i];
    const w = openSheet(`<div class="sheettitle">${esc(ex.name)} <span class="muted small">${esc(ex.scheme||'')}</span></div>
      <label>实际重量×次数<input class="input" id="shExA" value="${esc(ex.actual||'')}" placeholder="如 50kg×10,10,9"></label>
      <label>备注<input class="input" id="shExN" value="${esc(ex.note||'')}" placeholder="感受、力竭程度…"></label>
      <div class="bigbtns"><button class="btn primary" id="shExSave">保存</button></div>`);
    $('#shExSave',w).onclick = async()=>{
      ex.actual = $('#shExA',w).value.trim(); ex.note = $('#shExN',w).value.trim(); ex.done = ex.done || !!ex.actual;
      await persistLog(); closeSheet(); render();
    };
  },

  /* 照片 */
  'photo-view': (el)=>{
    openSheet(`<img src="${S.photoURLs.get(el.dataset.pid)}" style="width:100%;border-radius:12px">`, 'photosheet');
  },
  'photo-del': async(el)=>{
    if(!confirm('删除这张照片？')) return;
    await dbDel('photos', el.dataset.pid);
    S.log.reportPhotoIds = (S.log.reportPhotoIds||[]).filter(id=>id!==el.dataset.pid);
    await persistLog(); await reload();
  },
  'report-photo-toggle': async(el)=>{
    const pid = el.dataset.pid;
    let sel = S.log.reportPhotoIds||[];
    if(sel.includes(pid)) sel = sel.filter(x=>x!==pid);
    else { if(sel.length>=4) return toast('最多选4张'); sel = [...sel, pid]; }
    S.log.reportPhotoIds = sel; await persistLog(); render();
  },

  /* 日报 */
  'gen-png': async(el)=>{ el.disabled=true; el.textContent='生成中…';
    try{ await generateReportPNG(); }catch(err){ toast('生成失败：'+err.message); console.error(err); }
    el.disabled=false; el.textContent='🖼 生成日报长图 PNG'; },
  'copy-md': async()=>{
    const md = await buildMarkdown();
    try{ await navigator.clipboard.writeText(md); toast('日报文字已复制'); }
    catch(e){
      const w = openSheet(`<div class="sheettitle">复制失败，请手动全选复制</div><textarea class="input" rows="14" id="mdFallback">${esc(md)}</textarea>`);
      $('#mdFallback',w).select();
    }
  },
  'share-png': async(el)=>{
    const blob = S._lastPNG; if(!blob) return;
    const file = new File([blob], `Peak11_${S.date}.png`, {type:'image/png'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      try{ await navigator.share({files:[file], title:`Peak11 日报 ${S.date}`}); }catch(e){}
    } else toast('当前浏览器不支持分享文件，请长按图片保存');
  },

  /* 备份 */
  'export-json': async()=>{
    toast('正在导出…');
    const json = await exportBackup();
    const blob = new Blob([json], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `peak11_backup_${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
    toast('备份已导出');
  },

  /* 食物库管理 */
  'food-db': ()=>{ foodDBSheet(); },
};

function addFoodSheet(f, presetAmt){
  const w = openSheet(`<div class="sheettitle">${esc(f.name)} ${f.tag?`<span class="tagmark">${f.tag}</span>`:''}
      ${f.source==='est'?'<span class="estmark">估算</span>':'<span class="lblmark">标签</span>'}</div>
    ${f.note?`<div class="small muted">${esc(f.note)}</div>`:''}
    <label>数量（${f.unit}）<input class="input" id="shAmt" type="number" inputmode="decimal" step="0.1" value="${presetAmt??f.def}"></label>
    <div class="small muted" id="shPreview"></div>
    <label>餐次<select class="input" id="shMeal">${MEAL_KEYS.map(k=>`<option value="${k}">${S.plan?S.plan.mealNames[k]:MEAL_NAMES_DEFAULT[k]}</option>`).join('')}</select></label>
    <div class="bigbtns"><button class="btn primary big" id="shAdd">添加到已吃记录</button></div>`);
  const prev = ()=>{ const amt=parseFloat($('#shAmt',w).value);
    if(!isNaN(amt)){ const m=calcFood(f,amt);
      $('#shPreview',w).textContent = `${r0(m.kcal)} kcal · 碳${fmt(m.c)}g 蛋${fmt(m.p)}g 脂${fmt(m.f)}g`; } };
  prev(); $('#shAmt',w).oninput = prev;
  // 默认选中当前合理餐次
  const h = new Date().getHours();
  $('#shMeal',w).value = h<10?'breakfast':h<14?'lunch':h<17?'snack':h<21?'dinner':'presleep';
  $('#shAdd',w).onclick = async()=>{
    const amt = parseFloat($('#shAmt',w).value); if(isNaN(amt)||amt<=0) return toast('请输入有效数量');
    S.log.entries.push(entryFromFood(f, amt, $('#shMeal',w).value));
    await persistLog(); closeSheet(); toast(`已记录 ${f.name} ${fmt(amt)}${f.unit}`);
    S.tab='today'; render();
  };
}
function pickFoodForAmount(amount, title){
  const w = openSheet(`<div class="sheettitle">${esc(title)}</div>
    <input class="input" id="shSearch" placeholder="搜索食物…">
    <div class="foodlist" id="shList"></div>`);
  const renderList = q=>{
    $('#shList',w).innerHTML = S.foods.filter(f=>(f.unit==='g'||f.unit==='ml')&&(!q||f.name.includes(q))).map(f=>
      `<div class="fooditem" data-fid="${f.id}"><span class="fname">${esc(f.name)}</span><span class="addplus">＋</span></div>`).join('');
    $$('#shList .fooditem',w).forEach(it=>it.onclick=()=>{
      const f = S.foods.find(x=>x.id===it.dataset.fid);
      closeSheet(); addFoodSheet(f, amount);
    });
  };
  renderList('');
  $('#shSearch',w).oninput = e=>renderList(e.target.value.trim());
}

function foodDBSheet(){
  const w = openSheet(`<div class="sheettitle">食物数据库</div>
    <input class="input" id="shSearch" placeholder="搜索…">
    <div class="foodlist tall" id="shList"></div>
    <button class="btn primary" id="shNew">＋ 新增食物</button>`);
  const renderList = q=>{
    $('#shList',w).innerHTML = S.foods.filter(f=>!q||f.name.includes(q)).map(f=>
      `<div class="fooditem" data-fid="${f.id}"><span class="fname">${esc(f.name)}</span>
       <span class="muted small">${f.per===1?`每${f.unit}`:`每100${f.unit}`} ${f.kcal}k/${f.p}/${f.c}/${f.f}</span>
       <span class="addplus">✎</span></div>`).join('');
    $$('#shList .fooditem',w).forEach(it=>it.onclick=()=>editFoodSheet(S.foods.find(x=>x.id===it.dataset.fid)));
  };
  renderList('');
  $('#shSearch',w).oninput = e=>renderList(e.target.value.trim());
  $('#shNew',w).onclick = ()=>editFoodSheet(null);
}
function editFoodSheet(f){
  const isNew = !f;
  f = f || { id:'cf_'+Date.now(), name:'', unit:'g', per:100, kcal:0,p:0,c:0,f:0, source:'est', def:100 };
  const w = openSheet(`<div class="sheettitle">${isNew?'新增食物':'编辑食物'}</div>
    <div class="formgrid">
    <label>名称<input class="input" id="efName" value="${esc(f.name)}"></label>
    <label>单位<select class="input" id="efUnit">${['g','ml','个','袋','盒'].map(u=>`<option ${u===f.unit?'selected':''}>${u}</option>`).join('')}</select></label>
    <label>热量/${f.per===1?'单位':'100'} kcal<input class="input" id="efK" type="number" inputmode="decimal" value="${f.kcal}"></label>
    <label>蛋白质 g<input class="input" id="efP" type="number" inputmode="decimal" value="${f.p}"></label>
    <label>碳水 g<input class="input" id="efC" type="number" inputmode="decimal" value="${f.c}"></label>
    <label>脂肪 g<input class="input" id="efF" type="number" inputmode="decimal" value="${f.f}"></label>
    <label>膳食纤维 g<input class="input" id="efFib" type="number" inputmode="decimal" value="${f.fiber??''}"></label>
    <label>钠 mg<input class="input" id="efNa" type="number" inputmode="decimal" value="${f.na??''}"></label>
    <label>默认份量<input class="input" id="efDef" type="number" inputmode="decimal" value="${f.def}"></label>
    <label>数据来源<select class="input" id="efSrc"><option value="label" ${f.source==='label'?'selected':''}>商品标签</option><option value="est" ${f.source==='est'?'selected':''}>标准估算</option></select></label>
    </div>
    <div class="small muted">g/ml 按每100计；个/袋/盒按每1单位计。标签能量与宏量换算值可能略有出入，属正常，不需强行修改。</div>
    <div class="bigbtns"><button class="btn primary" id="efSave">保存</button>
    ${!isNew?'<button class="btn danger" id="efDel">删除此食物</button>':''}</div>`);
  $('#efSave',w).onclick = async()=>{
    const unit = $('#efUnit',w).value;
    const nf = { ...f, name:$('#efName',w).value.trim(), unit,
      per:(unit==='g'||unit==='ml')?100:1,
      kcal:parseFloat($('#efK',w).value)||0, p:parseFloat($('#efP',w).value)||0,
      c:parseFloat($('#efC',w).value)||0, f:parseFloat($('#efF',w).value)||0,
      fiber:parseFloat($('#efFib',w).value)||undefined, na:parseFloat($('#efNa',w).value)||undefined,
      def:parseFloat($('#efDef',w).value)||f.def, source:$('#efSrc',w).value };
    if(!nf.name) return toast('请填写名称');
    await dbPut('foods', nf); closeSheet(); toast('已保存'); await reload();
  };
  const del = $('#efDel',w);
  if(del) del.onclick = async()=>{
    if(!confirm('删除后计划中引用它的条目将无法计算，确定？')) return;
    await dbDel('foods', f.id); closeSheet(); await reload();
  };
}

/* ================= 启动 ================= */
async function boot(){
  await seedIfNeeded();
  await loadDate(S.date);
  await loadPrev();
  $$('.navbtn').forEach(b=>b.onclick=()=>{ S.tab=b.dataset.tab; render(); });
  render();
  if('serviceWorker' in navigator){
    try{ await navigator.serviceWorker.register('./sw.js'); }catch(e){ console.warn('SW注册失败', e); }
  }
}
boot();
