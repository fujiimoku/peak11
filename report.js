/* 日报生成：Markdown 文本 + 长图 PNG */
'use strict';

function rpt_fmtAmt(e){ return `${fmt(e.amount)}${e.unit}`; }
function rpt_val(v, suffix=''){ return (v==null || v==='') ? '未记录' : `${v}${suffix}`; }

async function collectReportData(){
  const date = S.date, plan = S.plan, log = S.log;
  const total = sumEntries(log.entries);
  const meals = MEAL_KEYS.map(mk=>{
    const items = log.entries.filter(e=>e.meal===mk);
    return { key:mk, name: plan? plan.mealNames[mk] : MEAL_NAMES_DEFAULT[mk], items, sum:sumEntries(items) };
  }).filter(m=>m.items.length);
  const estItems = [...new Set(log.entries.filter(e=>e.estimated).map(e=>e.name))];
  // 明日计划摘要
  const tomorrow = await getPlan(addDays(date,1));
  // 日报照片
  const selIds = log.reportPhotoIds||[];
  const photos = selIds.map(id=>S.photos.find(p=>p.id===id)).filter(Boolean).slice(0,4);
  return { date, plan, log, total, meals, estItems, tomorrow, photos };
}

/* ---------- Markdown ---------- */
async function buildMarkdown(){
  const d = await collectReportData();
  const { date, plan, log, total, meals, estItems, tomorrow } = d;
  const n = daysToComp(date);
  const L = [];
  L.push(`# ${date} 健体冲刺记录`);
  L.push('');
  L.push(`晨重：${log.morningWeight!=null?fmt(log.morningWeight)+'kg':'未记录'}`);
  L.push(`距离比赛：${n>0?n+'天':(n===0?'比赛日':'已结束')}`);
  L.push('');
  L.push('## 营养');
  if(plan){
    L.push(`实际热量：${r0(total.kcal)} / ${r0(plan.kcal)} kcal`);
    L.push(`碳水：${r0(total.c)} / ${r0(plan.targets.c)}g`);
    L.push(`蛋白质：${r0(total.p)} / ${r0(plan.targets.p)}g`);
    L.push(`脂肪：${r0(total.f)} / ${r0(plan.targets.f)}g`);
  } else {
    L.push(`实际热量：${r0(total.kcal)} kcal（当日无预设目标）`);
    L.push(`碳水：${r0(total.c)}g；蛋白质：${r0(total.p)}g；脂肪：${r0(total.f)}g`);
  }
  if(estItems.length) L.push(`存在估算误差的项目：${estItems.join('、')}`);
  else if(log.entries.length) L.push('全部摄入为商品标签数据。');
  L.push('');
  L.push('## 饮食（仅实际已记录）');
  if(!meals.length) L.push('未记录');
  for(const m of meals){
    L.push(`${m.name}：${m.items.map(e=>`${e.name}${e.tag?`(${e.tag})`:''}${rpt_fmtAmt(e)}`).join('、')}`);
    L.push(`　小计 ${r0(m.sum.kcal)} kcal · 碳${r0(m.sum.c)}g 蛋${r0(m.sum.p)}g 脂${r0(m.sum.f)}g`);
  }
  if(meals.length) L.push(`全天合计：${r0(total.kcal)} kcal · 碳${r0(total.c)}g 蛋${r0(total.p)}g 脂${r0(total.f)}g`);
  L.push('');
  L.push('## 训练');
  const exs = (log.exercises||[]).filter(e=>e.done||e.actual);
  const trainLines = [];
  if(log.strengthPart || log.strengthMinutes!=null)
    trainLines.push(`${log.strengthPart||'力量训练'}${log.strengthMinutes!=null?'，'+log.strengthMinutes+'分钟':''}`);
  for(const e of exs) trainLines.push(`${e.name}${e.actual?'：'+e.actual:'（已完成）'}${e.note?'（'+e.note+'）':''}`);
  if(log.danceMinutes!=null) trainLines.push(`舞蹈排练：${log.danceMinutes}分钟`);
  if(log.watchKcal!=null) trainLines.push(`Apple Watch 动态千卡：${log.watchKcal}（仅参考，不等同准确消耗）`);
  if(S.photos.some(p=>p.kind==='training')) trainLines.push('训练记录截图已附。');
  L.push(trainLines.length?trainLines.join('\n'):'未记录');
  L.push('');
  L.push('## 身体状态');
  L.push(`睡眠${rpt_val(log.sleepHours,'小时')}`);
  L.push(`饥饿${log.hunger!=null?log.hunger+'/5':'未记录'}`);
  L.push(`疲劳${log.fatigue!=null?log.fatigue+'/5':'未记录'}`);
  L.push(`肌肉饱满${log.fullness!=null?log.fullness+'/5':'未记录'}`);
  L.push(`排便/腹胀：${log.bowel||'未记录'}`);
  if(log.notes) L.push(`备注：${log.notes}`);
  L.push('');
  if(tomorrow){
    L.push('## 明日计划摘要');
    L.push(`${addDays(date,1)}：${tomorrow.type} · ${tomorrow.tplLabel}，目标 ${r0(tomorrow.kcal)} kcal（碳${tomorrow.targets.c}g / 蛋${tomorrow.targets.p}g / 脂${tomorrow.targets.f}g）`);
    L.push(`训练：${tomorrow.trainingTitle}`);
    L.push('');
  }
  L.push('## 需要ChatGPT评估');
  L.push('请根据实际摄入、训练记录、体型照片和近几日趋势，评估当前备赛状态，提出下一天需要调整的饮食和训练建议。');
  return L.join('\n');
}

/* ---------- PNG 长图 ---------- */
function blobToImage(blob){
  return new Promise((res,rej)=>{
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = ()=>res({img,url}); img.onerror = rej;
    img.src = url;
  });
}

async function generateReportPNG(){
  const d = await collectReportData();
  const { date, plan, log, total, meals, estItems, tomorrow, photos } = d;
  const n = daysToComp(date);
  const W = 760, PAD = 36, CW = W - PAD*2;
  const PURPLE = '#6d4fb3', DARK = '#2b2b33', GRAY = '#75757f', BG = '#faf9f6', LINE = '#e7e2f0';
  const FONT = '-apple-system, "PingFang SC", "Noto Sans SC", sans-serif';

  // 预加载图片
  const imgs = [];
  for(const p of photos){ try{ imgs.push(await blobToImage(p.blob)); }catch(e){} }

  // 两遍绘制：第一遍测高度
  function paint(ctx, measureOnly){
    let y = 0;
    const text = (s, size, color, weight='400', x=PAD, align='left')=>{
      if(!measureOnly){ ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align;
        ctx.fillText(s, align==='right'? W-PAD : x, y); ctx.textAlign='left'; }
      return size;
    };
    const wrapText = (s, size, color, weight='400', lh=1.5)=>{
      if(!measureOnly) ctx.font = `${weight} ${size}px ${FONT}`;
      else ctx.font = `${weight} ${size}px ${FONT}`;
      const words = String(s);
      let line = '';
      for(const ch of words){
        if(ctx.measureText(line+ch).width > CW){ y += size*lh; text(line, size, color, weight); line = ch; }
        else line += ch;
      }
      if(line){ y += size*lh; text(line, size, color, weight); }
    };
    const hr = ()=>{ y += 18; if(!measureOnly){ ctx.strokeStyle=LINE; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(PAD,y); ctx.lineTo(W-PAD,y); ctx.stroke(); } y += 10; };
    const section = (t)=>{ y += 34; if(!measureOnly){ ctx.fillStyle=PURPLE; ctx.fillRect(PAD, y-16, 6, 20); }
      text('  '+t, 24, DARK, '700'); y += 6; };

    // 头部
    y += 56;
    text('Peak 11 · 健体冲刺日报', 30, PURPLE, '800');
    y += 40;
    text(`${date}  ${weekdayCN(date)}`, 22, DARK, '600');
    text(n>0?`距比赛 ${n} 天`:(n===0?'🏆 比赛日':''), 22, PURPLE, '700', 0, 'right');
    y += 34;
    text(`晨重：${log.morningWeight!=null? fmt(log.morningWeight)+' kg':'未记录'}`, 26, DARK, '700');
    if(plan){ y += 30; text(`${plan.type} · ${plan.tplLabel}`, 18, GRAY); }
    hr();

    // 营养
    section('营养');
    const rows = plan ? [
      ['热量', r0(total.kcal), r0(plan.kcal), 'kcal'],
      ['碳水', r0(total.c), r0(plan.targets.c), 'g'],
      ['蛋白质', r0(total.p), r0(plan.targets.p), 'g'],
      ['脂肪', r0(total.f), r0(plan.targets.f), 'g'],
    ] : [['热量', r0(total.kcal), null,'kcal'],['碳水',r0(total.c),null,'g'],['蛋白质',r0(total.p),null,'g'],['脂肪',r0(total.f),null,'g']];
    for(const [lab, act, tgt, unit] of rows){
      y += 34;
      text(lab, 19, DARK, '500');
      const pct = tgt? Math.min(1, act/tgt) : 0;
      if(!measureOnly && tgt){
        const bx = PAD+90, bw = CW-90-210;
        ctx.fillStyle = '#eeeaf6'; ctx.fillRect(bx, y-14, bw, 16);
        ctx.fillStyle = act>tgt*1.03 ? '#c2762a' : PURPLE; ctx.fillRect(bx, y-14, bw*pct, 16);
      }
      text(tgt? `${act} / ${tgt} ${unit}（${tgt?Math.round(act/tgt*100):0}%）` : `${act} ${unit}`, 18, DARK, '600', 0, 'right');
    }
    y += 26;
    if(estItems.length) wrapText(`⚠ 存在估算误差的项目：${estItems.join('、')}`, 15, GRAY);
    else if(log.entries.length) wrapText('✓ 全部摄入为商品标签数据', 15, GRAY);
    hr();

    // 饮食
    section('饮食（仅实际已记录）');
    if(!meals.length){ y += 28; text('未记录', 18, GRAY); }
    for(const m of meals){
      y += 30; text(m.name, 19, PURPLE, '700');
      for(const e of m.items){
        y += 26;
        text(`· ${e.name}${e.tag?`(${e.tag})`:''}${e.estimated?' ⁽估⁾':''}`, 17, DARK);
        text(`${rpt_fmtAmt(e)} · ${r0(e.kcal)} kcal`, 16, GRAY, '400', 0, 'right');
      }
      y += 24;
      text(`小计 ${r0(m.sum.kcal)} kcal · 碳${r0(m.sum.c)} 蛋${r0(m.sum.p)} 脂${r0(m.sum.f)}`, 15, GRAY, '400', 0, 'right');
    }
    if(meals.length){ y += 28; text(`全天合计 ${r0(total.kcal)} kcal · 碳${r0(total.c)}g 蛋${r0(total.p)}g 脂${r0(total.f)}g`, 18, DARK, '700', 0, 'right'); }
    hr();

    // 训练
    section('训练');
    const exs = (log.exercises||[]).filter(e=>e.done||e.actual);
    let any = false;
    if(log.strengthPart || log.strengthMinutes!=null){ y+=28;
      text(`${log.strengthPart||'力量训练'}${log.strengthMinutes!=null?' · '+log.strengthMinutes+'分钟':''}`, 18, DARK, '600'); any=true; }
    for(const e of exs){ wrapText(`✓ ${e.name}${e.actual?'：'+e.actual:''}${e.note?'（'+e.note+'）':''}`, 17, DARK); any=true; }
    if(log.danceMinutes!=null){ y += 26; text(`舞蹈排练 ${log.danceMinutes} 分钟`, 17, DARK); any=true; }
    if(log.watchKcal!=null){ y += 24; text(`Apple Watch 动态 ${log.watchKcal} kcal（仅参考）`, 15, GRAY); any=true; }
    if(!any){ y += 28; text('未记录', 18, GRAY); }
    hr();

    // 身体状态
    section('身体状态');
    y += 30;
    const st = [
      `睡眠 ${log.sleepHours!=null?log.sleepHours+'h':'未记录'}`,
      `饥饿 ${log.hunger!=null?log.hunger+'/5':'未记录'}`,
      `疲劳 ${log.fatigue!=null?log.fatigue+'/5':'未记录'}`,
      `饱满 ${log.fullness!=null?log.fullness+'/5':'未记录'}`,
    ];
    if(!measureOnly){
      const bw2 = CW/4;
      st.forEach((s,i)=>{ ctx.font=`600 17px ${FONT}`; ctx.fillStyle=DARK; ctx.fillText(s, PAD+bw2*i, y); });
    }
    y += 10;
    if(log.bowel) wrapText(`排便/腹胀：${log.bowel}`, 16, DARK);
    if(log.notes) wrapText(`备注：${log.notes}`, 16, DARK);
    y += 14;

    // 照片
    if(imgs.length){
      hr(); section('今日照片');
      y += 16;
      const cols = Math.min(imgs.length, 2);
      const tw = (CW - (cols-1)*12)/cols;
      let rowH = 0, x = PAD, startY = y;
      imgs.forEach((o,i)=>{
        const ratio = o.img.height/o.img.width;
        const th = Math.min(tw*ratio, tw*1.3);
        if(i%cols===0 && i>0){ y += rowH + 12; rowH = 0; x = PAD; }
        if(!measureOnly){
          ctx.save();
          roundRectPath(ctx, x, y, tw, th, 10); ctx.clip();
          // cover 裁剪
          const sr = Math.max(tw/o.img.width, th/o.img.height);
          const sw = tw/sr, sh = th/sr;
          ctx.drawImage(o.img, (o.img.width-sw)/2, (o.img.height-sh)/2, sw, sh, x, y, tw, th);
          ctx.restore();
        }
        rowH = Math.max(rowH, th);
        x += tw + 12;
      });
      y += rowH;
    }

    // 明日计划
    if(tomorrow){
      hr(); section('明日计划摘要');
      y += 28;
      wrapText(`${addDays(date,1)} ${tomorrow.type} · ${tomorrow.tplLabel}`, 17, DARK, '600');
      y += 2; wrapText(`目标 ${r0(tomorrow.kcal)} kcal · 碳${tomorrow.targets.c}g 蛋${tomorrow.targets.p}g 脂${tomorrow.targets.f}g`, 16, GRAY);
      y += 2; wrapText(`训练：${tomorrow.trainingTitle}`, 16, GRAY);
    }

    y += 40;
    if(!measureOnly){ ctx.font=`400 13px ${FONT}`; ctx.fillStyle='#b4b0bc'; ctx.textAlign='center';
      ctx.fillText('Peak 11 · 数据仅为本人实际记录 · 单日体重波动不代表脂肪变化', W/2, y); ctx.textAlign='left'; }
    y += 30;
    return y;
  }
  function roundRectPath(ctx,x,y,w,h,r){ ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

  // 测量
  const mc = document.createElement('canvas'); mc.width=W; mc.height=100;
  const H = Math.ceil(paint(mc.getContext('2d'), true));
  // 真实绘制（2x 清晰度）
  const scale = 2;
  const cv = document.createElement('canvas'); cv.width = W*scale; cv.height = H*scale;
  const ctx = cv.getContext('2d'); ctx.scale(scale, scale);
  ctx.fillStyle = BG; ctx.fillRect(0,0,W,H);
  ctx.textBaseline = 'alphabetic';
  paint(ctx, false);
  imgs.forEach(o=>URL.revokeObjectURL(o.url));

  const blob = await new Promise(res=>cv.toBlob(res, 'image/png'));
  if(!blob) throw new Error('无法生成PNG');
  S._lastPNG = blob;
  const url = URL.createObjectURL(blob);
  const out = $('#reportOut');
  const canShareFile = !!(navigator.canShare && navigator.canShare({files:[new File([blob],'r.png',{type:'image/png'})]}));
  out.innerHTML = `<div class="sub">日报长图（长按图片可「存储图像」到相册）</div>
    <img src="${url}" class="reportimg" id="reportImg">
    <div class="bigbtns">
      ${canShareFile?'<button class="btn accent big" data-act="share-png">📤 分享日报图片</button>':''}
      <a class="btn big dl" href="${url}" download="Peak11_${date}.png">⬇️ 保存 PNG</a>
    </div>`;
  $('#reportImg').scrollIntoView({behavior:'smooth', block:'start'});
}
