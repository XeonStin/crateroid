// ============ 弹坑星球 CRATEROID — 全局配置 ============

export const WORLD_W = 1800;
export const WORLD_H = 1000;

// 普通对战可选地图宽度（高度保持 1000，主题地形的基准高度不变）
// 选「自定义」时用滑块在 500~2000 之间任调（选图界面）
export const MAP_SIZES = {
  small:  { name: '小', w: 800, desc: '贴脸混战，一屏看完' },
  medium: { name: '中', w: 1200, desc: '标准战场' },
  large:  { name: '大', w: 1800, desc: '远程对轰，弹道空间更大' },
};
export const MAP_W_MIN = 500;
export const MAP_W_MAX = 2000;

export const GRAVITY = 900;          // px/s²
export const WORM_R = 11;            // 虫虫碰撞半径
export const WALK_SPEED = 88;        // px/s
export const JUMP_VY = -400;
export const AIR_CONTROL = 64;       // 空中左右控制（斜向跳跃）px/s
export const DASH_SPEED = 430;       // 冲刺速度
export const DASH_TIME = 0.28;       // 冲刺时长
export const MAX_FALL_NO_DMG = 650;  // 超过此落地速度开始摔伤（调高=摔伤更宽松）
export const FALL_DMG_K = 0.042;     // 摔伤系数（调低=伤害更小）
export const WIND_MAX_ACC = 230;     // wind=1 时的水平加速度 px/s²

export const TURN_TIME = 45;         // 每回合操作秒数
export const RETREAT_TIME = 5;       // 发射后撤退秒数
export const BANNER_TIME = 1.5;
export const SUDDEN_DEATH_ROUND = 11; // 第 N 回合进入突死（回合=双方各行动一轮）
export const SUDDEN_DEATH_HP = 25;   // 突死全员压到该 HP（还剩 1~2 发的博弈，不是抢先手抽签）
export const WATER_RISE = 48;        // 突死每回合上涨 px（水面 y 每回合减小值；熔岩图 ×waterRiseMult）
export const CRATE_CHANCE = 0.3;     // 每回合补给箱概率
export const MAX_CRATES = 2;

export const STEP_UP = 8;            // 自动爬坡高度
export const SUBSTEPS = 4;           // 投射物每帧子步

// ---------------- 武器表 ----------------
export const WEAPONS = [
  { id: 'bazooka',  name: '火箭弹',   icon: '🚀', ammo: Infinity, charge: true,  wind: 1.0,  gravity: 1.0,  bounce: false, radius: 46, dmg: 48 },
  { id: 'grenade',  name: '手雷',     icon: '💣', ammo: Infinity, charge: true,  wind: 0.15, gravity: 1.0,  bounce: true,  fuse: 3.0,  radius: 42, dmg: 44 },
  { id: 'cluster',  name: '集束炸弹', icon: '🧨', ammo: 2, charge: true,  wind: 0.1,  gravity: 1.0,  bounce: false, fuse: 2.2, radius: 30, dmg: 26, cluster: 5 },
  // 散弹枪：瞬发 5 弹丸散布；每颗命中虫虫单发伤害，命中地形打小洞
  { id: 'shotgun',  name: '散弹枪',   icon: '🔫', ammo: 3, hitscan: true, shots: 2, pellets: 5, spread: 5.5, dmg: 11, kb: 60, range: 260, crater: 13 },
  { id: 'airstrike',name: '空袭',     icon: '✈️', ammo: 2, targeting: true, bombs: 5, radius: 36, dmg: 32 },
  { id: 'driller',  name: '钻地弹',   icon: '⛏️', ammo: 2, charge: true,  wind: 0,    gravity: 0.55, bounce: false, radius: 24, dmg: 30, drill: 90 },
  { id: 'holy',     name: '神圣手雷', icon: '🐑', ammo: 0, charge: true,  wind: 0.15, gravity: 1.0,  bounce: true,  fuse: 3.0,  radius: 84, dmg: 78, holy: true },
  { id: 'cow',      name: '奶牛空袭', icon: '🐮', ammo: 0, targeting: true, bounces: 5, dmg: 26, radius: 40 },
  // 传送：点地图任意可站立点瞬移（消耗回合）；点无效位置不扣弹、可重新标记
  { id: 'teleport', name: '传送',     icon: '🌀', ammo: 1, targeting: true, teleport: true },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

// ---------------- 武器图鉴（说明页文案；数值行逐条手写以便组合展示） ----------------
export const WEAPON_MANUAL_NOTE = '直接命中虫体必暴击（×1.6）· 爆炸另有 7% 概率暴击 · 引爆油桶会连锁殉爆';
export const WEAPON_MANUAL = {
  bazooka: {
    desc: '万金油直射弹。弹道受风影响，直接命中虫体必暴击。',
    stats: [['伤害', '48'], ['爆炸半径', '46px'], ['弹药', '∞'], ['特性', '受风影响']],
  },
  grenade: {
    desc: '3 秒引信，碰墙/碰虫会弹跳。可以滚进坑里，炸掩体后面的敌人。',
    stats: [['伤害', '44'], ['爆炸半径', '42px'], ['引信', '3.0s'], ['弹药', '∞'], ['特性', '弹跳']],
  },
  cluster: {
    desc: '飞行中分裂成 5 颗子雷，覆盖一大片区域，清场/挖坑两用。',
    stats: [['主爆炸', '26'], ['子雷', '24 ×5'], ['爆炸半径', '30px'], ['引信', '2.2s'], ['弹药', '2'], ['特性', '分裂']],
  },
  shotgun: {
    desc: '瞬发 5 弹丸扇形散布，每颗都能削土。蓄力收束散布（满力 2.75°），贴脸全中是爆发神技。',
    stats: [['单丸伤害', '11 ×5'], ['射程', '260px'], ['每回合', '2 发'], ['弹药', '3'], ['特性', '瞬发 · 挖地']],
  },
  airstrike: {
    desc: '点击地图标记，运输机沿航线投下 5 枚炸弹。无视地形阻挡，远程打击首选。',
    stats: [['单弹伤害', '32 ×5'], ['爆炸半径', '36px'], ['弹药', '2'], ['特性', '范围标记']],
  },
  driller: {
    desc: '钻入地形 90px 后再爆炸。不受风影响，隔山打牛、掘地三尺。',
    stats: [['伤害', '30'], ['爆炸半径', '24px'], ['钻地深度', '90px'], ['弹药', '2'], ['特性', '钻地 · 免风']],
  },
  holy: {
    desc: '毁天灭地的大当量手雷，半径 84px。注意别把自己搭进去。',
    stats: [['伤害', '78'], ['爆炸半径', '84px'], ['引信', '3.0s'], ['弹药', '0（补给箱）'], ['特性', '弹跳 · 超大半径']],
  },
  cow: {
    desc: '点击地图标记落点，奶牛从天而降连续踩踏 5 次，边踩边挖坑，把敌人带进坑里。',
    stats: [['单次踩踏', '26 ×5'], ['爆炸半径', '40px'], ['弹药', '0（补给箱）'], ['特性', '5 连踩 · 挖地']],
  },
  teleport: {
    desc: '点击地图任意可站立点瞬移（消耗回合）。上浮岛、下洞底、脱离包围全靠它。',
    stats: [['弹药', '1（每队）'], ['特性', '瞬移']],
  },
};
// 内部隐藏弹种（不在武器栏出现）
WEAPON_BY_ID.bomblet = { id: 'bomblet', name: '子雷', icon: '•', hidden: true, ammo: 0, wind: 0.4, gravity: 1, bounce: false, radius: 26, dmg: 24 };
WEAPON_BY_ID.bomb = { id: 'bomb', name: '航空炸弹', icon: '•', hidden: true, ammo: 0, wind: 0.3, gravity: 1, bounce: false, radius: 36, dmg: 32 };

// 武器箱可开出的弹药（权重）
export const CRATE_WEAPON_DROPS = [
  ['cluster', 1, 3], ['shotgun', 2, 3], ['airstrike', 1, 3],
  ['driller', 1, 2], ['holy', 1, 2], ['cow', 1, 2],
];

export const CRATE_TYPES = [
  { id: 'health', icon: '❤️', color: 0xff5a76, weight: 4 },
  { id: 'weapon', icon: '🎁', color: 0xffb545, weight: 4 },
  { id: 'tool',   icon: '🔧', color: 0x53c8ff, weight: 2 },
];

// ---------------- 地图主题 ----------------
// windScale: 该地图风力倍率；decor: 地表装饰物；地形高度按世界 1800×1000 缩放
export const THEMES = {
  islands: {
    name: '翠绿群岛', icon: '🏝️',
    sky: ['#7ec8f7 0%', '#bfe8ff 55%', '#e8f7ff 100%'],
    top: 0x58c24f, top2: 0x7ee06f, body: 0x8a5a33, body2: 0x6e4526, speck: 0xa8794a,
    water: 0x2f86d6, waterAlpha: 0.75, waterDeep: 0x155a9e,
    clouds: true, stars: 0, aurora: false, embers: false,
    base: 470, amps: [170, 78, 26], waterY: 852, islands: true, lakes: 1,
    mesas: false, windScale: 1.0, decor: 'palm',
    desc: '风格均衡：2~3 座浮岛，标准风力，适合新手',
  },
  desert: {
    name: '落日沙漠', icon: '🏜️',
    sky: ['#ff9a5a 0%', '#ffc27a 45%', '#ffe3b0 100%'],
    top: 0xe8c56a, top2: 0xf7dd97, body: 0xc98f4e, body2: 0xa86f3a, speck: 0xd9a860,
    water: 0x3a86c8, waterAlpha: 0.7, waterDeep: 0x1d5a90,
    clouds: true, stars: 0, aurora: false, embers: false,
    base: 500, amps: [128, 92, 20], waterY: 895, islands: false, lakes: 0, mesas: true,
    windScale: 0.7, decor: 'cactus', gust: true,
    desc: '风最小但有阵风：平顶台地+缓坡，回合内风向会漂移',
  },
  snow: {
    name: '极光雪原', icon: '🏔️',
    sky: ['#0e1e42 0%', '#1d3a6e 55%', '#2c5586 100%'],
    top: 0xeef6fb, top2: 0xffffff, body: 0x8fa6bd, body2: 0x6f87a3, speck: 0xa9bdd2,
    water: 0x2a6db5, waterAlpha: 0.8, waterDeep: 0x123f75,
    clouds: false, stars: 90, aurora: true, embers: false,
    base: 462, amps: [196, 88, 30], waterY: 858, islands: true, lakes: 0,
    mesas: false, windScale: 1.35, decor: 'pine', slide: true,
    desc: '风最大+冰面打滑：暴风雪山峰，走位会惯性滑出去',
  },
  lava: {
    name: '熔岩星球', icon: '🌋',
    sky: ['#1a0b12 0%', '#3d1418 55%', '#68220f 100%'],
    top: 0x6a5a66, top2: 0x84718a, body: 0x453d4a, body2: 0x332c38, speck: 0x5c4f60,
    water: 0xff5a1e, waterAlpha: 0.92, waterDeep: 0xc22e00, lava: true,
    clouds: false, stars: 60, aurora: false, embers: true,
    base: 486, amps: [182, 92, 26], waterY: 838, islands: true, lakes: 0,
    mesas: false, windScale: 1.15, decor: 'crystal', waterRiseMult: 2,
    desc: '熔岩扑面且突死涨水翻倍：风偏强，站位要更小心',
  },
};

// ---------------- AI 难度 ----------------
export const DIFFICULTY = {
  easy:   { name: '简单 🐣', angleStep: 30, powerStep: 0.28, angleNoise: 9,  powerNoise: 0.13, simulateWind: false, refine: 0, moveIQ: 0, retreat: false, smartWeapon: false },
  normal: { name: '普通 🐥', angleStep: 14, powerStep: 0.16, angleNoise: 3.5, powerNoise: 0.05, simulateWind: true,  refine: 1, moveIQ: 0, retreat: false, smartWeapon: false, firstShotNoise: 2.5 },
  hard:   { name: '困难 🦅', angleStep: 7,  powerStep: 0.1,  angleNoise: 1.4, powerNoise: 0.02, simulateWind: true,  refine: 2, moveIQ: 1, retreat: true,  smartWeapon: true },
};

// ---------------- 外观 ----------------
export const PLAYER_COLORS = ['#ff6b81', '#4d96ff', '#ffd93d', '#6bd968', '#b980ff', '#ff9f43'];
export const ENEMY_COLORS = ['#8d99ae', '#ef476f', '#06d6a0', '#f78c6b', '#9b5de5', '#00bbf9'];
export const HATS = ['cap', 'bow', 'tophat', 'flower', 'helmet', 'bandana'];
export const WORM_NAMES = ['蠕蠕', '弹弹', '咕咕', '球球', '泡泡', '呆呆', '麻薯', '布丁', '年糕', '汤圆', '糯米', '曲奇', '果冻', '薯条', '蛋挞', '团子', '花卷', '烧麦'];

export const TAUNTS = ['接招吧！', '看我的必杀技！', '嘿嘿，稳了～', '风我都算好了', '这波操作满分', '锁定目标！', '弹道无所谓，气势要足！', '给你挖个坑～'];
export const OUCHES = ['哎哟！', '好痛！', '我记住了！', '居然偷袭我', '呜哇！'];
export const DEATH_WORDS = ['安息吧~', '卒', '躺平了', '下次一定', '我先撤了'];
export const EPITAPHS = ['此处长眠一只虫', '卒于弹坑', '风没算对', '差一点就赢', '扑通'];

export const TEAM_INFO = [
  { name: '玩家队', color: '#4d96ff' },
  { name: '虫虫军团', color: '#ef476f' },
];

// 暴击：爆炸有概率打出 1.6 倍伤害
export const CRIT_CHANCE = 0.07;
export const CRIT_MULT = 1.6;

// ---------------- 终局慢镜头（电影化：节拍式变速 + 运镜） ----------------
export const FINALE_ZOOM = 1.7;           // 终局特写缩放（手机自动降到 1.45）
export const FINALE_PRELAUNCH_TS = 0.4;   // 预热推镜：时间倍率
export const FINALE_PRELAUNCH_T = 0.28;   // 预热时长（游戏秒）——镜头缓推到发射虫特写
export const FINALE_BEAT_TS = 0.1;        // 关键节拍（发射瞬间/临爆）时间倍率
export const FINALE_LAUNCH_HOLD = 0.16;   // 发射节拍持续（游戏秒；缓动下稍加长保证俯冲可读）
export const FINALE_IMPACT_WINDOW = 0.15; // 临爆节拍提前量（游戏秒，按预测命中时刻倒推）
export const FINALE_CRUISE_TS = 0.6;      // 飞行巡航时间倍率
export const FINALE_FLIGHT_WIDE_ZOOM = 0.8; // 巡航段拉宽视野（看全弹道，弹丸不出画）
export const FINALE_AFTERMATH_TS = 0.15;  // 爆炸/倒地慢放倍率
export const FINALE_AFTERMATH_T = 0.5;    // 慢放时长（游戏秒）
export const FINALE_LINGER_T = 0.6;       // 特效结束后的定格缓冲（游戏秒）

// ---------------- 高光时刻（非终局的高难命中同样给电影镜头） ----------------
export const HIGHLIGHT_DIRECT_DIST = 600;   // 远距直接命中：飞行轨迹长度阈值 px（高抛大弧线也算）
export const HIGHLIGHT_NEAR_DIST = 22;      // 精准贴爆：爆心距敌人体中心 px
export const HIGHLIGHT_NEAR_MIN_SHOT = 300; // 贴爆的最短轨迹长度 px（排除近身白给）
export const HIGHLIGHT_CRUISE_TS = 0.6;     // 高光飞行巡航倍率（与终局同拍，仅时长更短）
export const HIGHLIGHT_AFTERMATH_TS = 0.15; // 高光爆炸慢放倍率
export const HIGHLIGHT_AFTERMATH_T = 0.3;   // 高光慢放时长（游戏秒）
export const HIGHLIGHT_LINGER_T = 0.35;     // 高光定格时长（游戏秒）
export const HIGHLIGHT_CD = 6;              // 高光冷却（游戏秒），防连锁爆炸连发

// ---------------- 成就 ----------------
export const ACHIEVEMENTS = {
  first_win:    { icon: '🏆', name: '初次胜利', desc: '赢下第一场对局' },
  double_kill:  { icon: '💥', name: '双杀',     desc: '一次爆炸击倒 2 只敌人' },
  triple_kill:  { icon: '☄️', name: '三杀',     desc: '一次爆炸击倒 3 只敌人' },
  long_shot:    { icon: '🎯', name: '神枪手',   desc: '700px 外命中敌人' },
  crit:         { icon: '✨', name: '暴击时刻', desc: '打出一次暴击' },
  flawless:     { icon: '🛡️', name: '毫发无伤', desc: '全员零受伤获胜' },
  crate_addict: { icon: '📦', name: '补给大亨', desc: '单局拾取 3 个补给箱' },
  berserk_win:  { icon: '🔥', name: '背水一战', desc: '仅剩 1 只虫虫时翻盘获胜' },
  terrain_kill: { icon: '🌊', name: '地形杀',   desc: '让一名敌人葬身水底' },
  driller_kill: { icon: '⛏️', name: '掘地三尺', desc: '用钻地弹击杀敌人' },
  holy_kill:    { icon: '🐑', name: '神圣制裁', desc: '用神圣手雷击杀敌人' },
  cow_kill:     { icon: '🐮', name: '天降奶牛', desc: '用奶牛空袭击杀敌人' },
  airstrike_kill:{ icon: '✈️', name: '空中支援', desc: '用空袭击杀敌人' },
  shotgun_kill: { icon: '🔫', name: '近身扫射', desc: '用散弹枪击杀敌人' },
  big_shot:     { icon: '💣', name: '重炮手',   desc: '单次爆炸对敌人造成 ≥100 伤害' },
  full_pellets: { icon: '🥇', name: '弹无虚发', desc: '散弹枪 5 颗弹丸全部命中敌人' },
  low_hp_kill:  { icon: '🩹', name: '濒死反杀', desc: '自己 HP ≤ 10 时击杀敌人' },
  sudden_win:   { icon: '☠️', name: '突死幸存', desc: '在突死阶段翻盘获胜' },
  air_crate:    { icon: '🪂', name: '空中接箱', desc: '在空中接到补给箱' },
  teleport_use: { icon: '🌀', name: '时空跳跃', desc: '首次使用传送' },
};
