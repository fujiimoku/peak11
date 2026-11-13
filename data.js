/* Peak 11 预设数据：食物库 / 菜单模板 / 日期计划 / 训练计划 */
'use strict';

// 单位：g/ml 的食物按每100计；个/袋/盒按每1个单位计。
// 字段：kcal, p(蛋白), c(碳水), f(脂肪), fiber(膳食纤维), na(钠mg)
// source: 'label' 商品标签 | 'est' 标准估算
const SEED_FOODS = [
  // ---- 商品标签数据 ----
  { id:'milk_skim',    name:'纽麦福脱脂奶',           unit:'ml', per:100, kcal:35,   p:4,    c:4.6,  f:0,              source:'label', def:200 },
  { id:'chobani',      name:'Chobani香草希腊酸奶',    unit:'g',  per:100, kcal:93.5, p:7.8,  c:9.5,  f:2.6,            source:'label', def:160, note:'每盒160g' },
  { id:'purple_yog',   name:'紫色发酵乳',             unit:'g',  per:100, kcal:86,   p:3,    c:9.3,  f:3,  fiber:5,    source:'label', def:340, note:'一盒340g' },
  { id:'three_beans',  name:'乐此粗粮三色豆',         unit:'g',  per:100, kcal:138,  p:8.2,  c:18.4, f:1.5, fiber:8.6, source:'label', def:50,  note:'每袋50g' },
  { id:'pro_bread',    name:'蛋白面包',               unit:'g',  per:100, kcal:258,  p:15.6, c:38.2, f:1.8,            source:'label', def:50 },
  { id:'oats_mix',     name:'燕麦亚麻籽可可燕麦',     unit:'g',  per:100, kcal:412,  p:14.2, c:58.4, f:10.8, fiber:11.2, source:'label', def:35 },
  { id:'dongpeng',     name:'东鹏能量饮料',           unit:'ml', per:100, kcal:36.6, p:0,    c:9,    f:0,              source:'label', def:450 },
  { id:'youxing',      name:'优形鸡胸肉(即食)',       unit:'g',  per:100, kcal:128,  p:23.7, c:2.9,  f:2.3, na:633,    source:'label', def:100 },
  { id:'pro_latiao',   name:'蛋白辣条',               unit:'g',  per:100, kcal:154,  p:25.6, c:6.2,  f:1.5, fiber:6, na:487, source:'label', def:60, note:'一袋60g' },
  { id:'buckwheat',    name:'干荞麦面饼',             unit:'g',  per:100, kcal:340,  p:11.3, c:70.2, f:2.8,            source:'label', def:50, note:'干重' },
  // ---- 标准估算 ----
  { id:'rice_cooked',  name:'熟米饭',                 unit:'g',  per:100, kcal:116,  p:2.6,  c:25.9, f:0.3,            source:'est', def:300, tag:'熟重' },
  { id:'rice_noodle',  name:'熟籼米粉',               unit:'g',  per:100, kcal:110,  p:2,    c:25,   f:0.25,           source:'est', def:200, tag:'熟重', note:'含水量会影响实际数据' },
  { id:'chicken_raw',  name:'鸡胸肉(生重)',           unit:'g',  per:100, kcal:108,  p:22.5, c:0,    f:2,              source:'est', def:180, tag:'生重' },
  { id:'chicken_ckd',  name:'鸡胸肉(熟重)',           unit:'g',  per:100, kcal:165,  p:31,   c:0,    f:3.6,            source:'est', def:120, tag:'熟重' },
  { id:'beef_raw',     name:'瘦牛肉(生重)',           unit:'g',  per:100, kcal:125,  p:20,   c:0,    f:5,              source:'est', def:120, tag:'生重' },
  { id:'veg_mix',      name:'蔬菜混合',               unit:'g',  per:100, kcal:24,   p:2,    c:4,    f:0.3,            source:'est', def:200, note:'不含烹调油' },
  { id:'banana',       name:'香蕉(去皮可食)',         unit:'g',  per:100, kcal:89,   p:1.1,  c:22.8, f:0.3,            source:'est', def:150, tag:'去皮' },
  { id:'egg_whole',    name:'全蛋',                   unit:'个', per:1,   kcal:72,   p:6.3,  c:0.4,  f:5,              source:'est', def:1 },
  { id:'egg_white',    name:'鸡蛋白',                 unit:'个', per:1,   kcal:17,   p:3.6,  c:0.25, f:0,              source:'est', def:4 },
  { id:'pumpkin_seed', name:'南瓜籽仁',               unit:'g',  per:100, kcal:560,  p:30,   c:11,   f:49,             source:'est', def:10 },
  { id:'oil',          name:'烹调用油',               unit:'g',  per:100, kcal:900,  p:0,    c:0,    f:100,            source:'est', def:8, note:'食堂未知油量可估0–15g' },
];

// 餐次 key 固定，名称随计划变化
const MEAL_KEYS = ['breakfast','lunch','snack','dinner','presleep'];
const MEAL_NAMES_DEFAULT = { breakfast:'早餐', lunch:'午餐', snack:'加餐', dinner:'晚餐', presleep:'睡前' };

function T(items){ return items.map(([foodId,amount])=>({foodId,amount})); }

const TEMPLATES = {
  A: {
    label:'A · 舞蹈比赛日', kcal:2547, targets:{ c:360, p:163, f:50 },
    mealNames:{ snack:'候场加餐' },
    meals:{
      breakfast: T([['pro_bread',100],['egg_whole',2],['milk_skim',200],['banana',100]]),
      lunch:     T([['chicken_raw',180],['rice_cooked',300],['veg_mix',150],['oil',8]]),
      snack:     T([['banana',240],['pro_bread',50],['milk_skim',200]]),
      dinner:    T([['beef_raw',120],['rice_cooked',300],['veg_mix',200],['oil',3]]),
      presleep:  T([['chobani',160],['oats_mix',35],['pumpkin_seed',10]]),
    },
  },
  B: {
    label:'B · 力量训练日', kcal:2390, targets:{ c:335, p:161, f:46 },
    mealNames:{ snack:'训练前后' },
    meals:{
      breakfast: T([['rice_noodle',200],['egg_white',4],['egg_whole',1],['milk_skim',200],['oats_mix',35]]),
      lunch:     T([['chicken_raw',180],['rice_cooked',300],['veg_mix',250],['oil',8]]),
      snack:     T([['banana',150],['pro_bread',50],['milk_skim',200]]),
      dinner:    T([['beef_raw',120],['rice_cooked',300],['veg_mix',250],['oil',5]]),
      presleep:  T([['chobani',160],['pumpkin_seed',10]]),
    },
  },
  C: {
    label:'C · 恢复休息日', kcal:2203, targets:{ c:303, p:152, f:45 },
    mealNames:{ snack:'下午加餐' },
    meals:{
      breakfast: T([['rice_noodle',200],['egg_white',4],['egg_whole',1],['milk_skim',200],['oats_mix',35]]),
      lunch:     T([['chicken_raw',180],['rice_cooked',300],['veg_mix',250],['oil',8]]),
      snack:     T([['banana',150],['milk_skim',200]]),
      dinner:    T([['beef_raw',120],['rice_cooked',250],['veg_mix',250],['oil',5]]),
      presleep:  T([['chobani',160],['pumpkin_seed',10]]),
    },
  },
  D: {
    label:'D · 温和充碳日', kcal:2468, targets:{ c:363, p:160, f:41 },
    mealNames:{ snack:'下午加餐' },
    meals:{
      breakfast: T([['rice_noodle',250],['egg_white',4],['egg_whole',1],['milk_skim',200]]),
      lunch:     T([['chicken_raw',180],['rice_cooked',350],['veg_mix',150],['oil',8]]),
      snack:     T([['banana',150],['pro_bread',100],['milk_skim',200]]),
      dinner:    T([['beef_raw',120],['rice_cooked',350],['veg_mix',150],['oil',8]]),
      presleep:  T([['chobani',160]]),
    },
  },
};

const COMP_DATE = '2026-11-22';

// 每日计划：dayType 显示用，template 复制自 TEMPLATES 后可编辑
const DAY_PLANS = [
  { date:'2026-11-12', type:'舞蹈比赛', tpl:'A', trainingTitle:'舞蹈比赛（力量训练休息）', exercises:[] },
  { date:'2026-11-13', type:'背',       tpl:'B', trainingTitle:'背部训练',
    exercises:[['高位下拉','3组×8–12'],['胸部支撑划船','3组×8–12'],['绳索直臂下拉','2组×12–15'],['反向飞鸟','2组×12–15']] },
  { date:'2026-11-14', type:'胸',       tpl:'B', trainingTitle:'胸部训练',
    exercises:[['上斜哑铃卧推','3组×8–10'],['杠铃卧推','3组×6–10'],['绳索夹胸','2组×12–15'],['辅助双杠臂屈伸','2组×10–12']] },
  { date:'2026-11-15', type:'肩',       tpl:'B', trainingTitle:'肩部训练（可因舞蹈排练调整）',
    exercises:[['侧平举','4组×12–18'],['史密斯推举','2组×8–12'],['反向飞鸟','3组×12–15'],['绳索侧平举','2组×12–15']] },
  { date:'2026-11-16', type:'恢复',     tpl:'C', trainingTitle:'休息 ＋ 造型练习20分钟', exercises:[['造型练习','约20分钟']] },
  { date:'2026-11-17', type:'背',       tpl:'B', trainingTitle:'轻中量上肢综合（最后一次）',
    exercises:[['高位下拉','2组×10–15 留2–3余力'],['器械划船','2组×10–15 留2–3余力'],['上斜卧推','2组×10–15 留2–3余力'],['绳索夹胸','2组×10–15 留2–3余力'],['侧平举','2组×10–15 留2–3余力'],['反向飞鸟','2组×10–15 留2–3余力']] },
  { date:'2026-11-18', type:'恢复',     tpl:'C', trainingTitle:'休息 ＋ 造型练习15–20分钟', exercises:[['造型练习','15–20分钟']] },
  { date:'2026-11-19', type:'背',       tpl:'B', trainingTitle:'力量训练（香蕉减为100g）',
    kcal:2345, targets:{ c:324, p:161, f:46 },
    patch:(meals)=>{ const b=meals.snack.find(i=>i.foodId==='banana'); if(b) b.amount=100; },
    exercises:[['高位下拉','2组×10–15'],['器械划船','2组×10–15'],['侧平举','2组×12–15'],['反向飞鸟','2组×12–15']] },
  { date:'2026-11-20', type:'充碳',     tpl:'D', trainingTitle:'休息 / 造型', exercises:[['造型练习','轻量']] },
  { date:'2026-11-21', type:'充碳',     tpl:'D', trainingTitle:'休息 / 造型',
    kcal:2538, targets:{ c:379, p:160, f:41 },
    patch:(meals)=>{ const r=meals.dinner.find(i=>i.foodId==='rice_cooked'); if(r) r.amount=410; },
    exercises:[['造型练习','轻量']] },
  { date:'2026-11-22', type:'健体比赛', tpl:null, trainingTitle:'健体比赛日',
    kcal:2500, targets:{ c:370, p:150, f:42 }, special:true,
    mealNames:{ breakfast:'赛前主餐(上台前3–4小时)', lunch:'赛前碳水(上台前60–90分钟)', snack:'泵感充血(上台前15–25分钟)', dinner:'赛后恢复餐', presleep:'睡前' },
    meals:{
      breakfast: T([['rice_cooked',250],['chicken_ckd',150],['banana',100]]),
      lunch:     T([['pro_bread',50],['banana',100]]),
      snack:     T([['pro_bread',25],['dongpeng',150]]),
      dinner:    T([['chicken_raw',150],['rice_cooked',300],['veg_mix',200],['oil',5]]),
      presleep:  T([['chobani',160]]),
    },
    note:'比赛日时间轴为可编辑的初始方案，请根据实际登台时间调整各餐时间与份量。' },
];

function buildSeedPlans(){
  return DAY_PLANS.map(d=>{
    const tpl = d.tpl ? TEMPLATES[d.tpl] : null;
    const meals = {};
    const src = d.meals || (tpl && tpl.meals) || {};
    for(const k of MEAL_KEYS) meals[k] = (src[k]||[]).map(i=>({...i}));
    if(d.patch) d.patch(meals);
    const mealNames = { ...MEAL_NAMES_DEFAULT, ...(tpl? tpl.mealNames:{}), ...(d.mealNames||{}) };
    return {
      date: d.date,
      type: d.type,
      tplLabel: tpl ? tpl.label : '比赛日 · 特殊时间轴',
      special: !!d.special,
      specialNote: d.note || '',
      kcal: d.kcal ?? (tpl? tpl.kcal : 0),
      targets: d.targets ?? (tpl? {...tpl.targets} : {c:0,p:0,f:0}),
      mealNames,
      meals,
      trainingTitle: d.trainingTitle,
      exercises: (d.exercises||[]).map(([name,scheme])=>({name,scheme})),
    };
  });
}
