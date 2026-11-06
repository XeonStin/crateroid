// ============ 教学关卡专用地形（在程序生成之后覆写掩码） ============
// 每个场景函数在 Terrain.generate() 绘制纹理之前调用：
//   - 直接改写 t.mask（1=实心）
//   - 可改写 t.waterY
//   - t.noDecor = true 可关闭随机地表装饰（避免挡住靶子/旗杆）
// 注意：掩码步长必须用 t.W/t.H（当前地形实例的实际尺寸），不要用全局常量——
// 将来教学关配了自定义 worldW 时，常量步长会写错行甚至整片场景无声错位

function reset(t) {
  t.mask.fill(0);
  t.noDecor = true;
}

// 从 topY 向下填满实心地面
function ground(t, topY) {
  const { W, H } = t;
  const y0 = Math.max(0, topY | 0);
  for (let x = 0; x < W; x++) {
    for (let y = y0; y < H; y++) t.mask[y * W + x] = 1;
  }
}

function rect(t, x0, y0, x1, y1, solid = true) {
  const { W, H } = t;
  const ax = Math.max(0, Math.min(W - 1, x0 | 0));
  const bx = Math.max(0, Math.min(W - 1, x1 | 0));
  const ay = Math.max(0, Math.min(H - 1, y0 | 0));
  const by = Math.max(0, Math.min(H - 1, y1 | 0));
  const v = solid ? 1 : 0;
  for (let y = ay; y <= by; y++) {
    for (let x = ax; x <= bx; x++) t.mask[y * W + x] = v;
  }
}

function carve(t, x0, y0, x1, y1) { rect(t, x0, y0, x1, y1, false); }

export const TUTORIAL_SCENES = {
  // 第一课：平地 + 140px 深的大坑（单跳 89px 出不去，二段跳刚好）
  pit(t) {
    reset(t);
    ground(t, 520);
    carve(t, 560, 520, 760, 660);
    t.waterY = 900;
  },

  // 第二课：一片平地，靶子在 750px 外
  aim(t) {
    reset(t);
    ground(t, 520);
  },

  // 第三课 · 火箭弹：开阔平地
  flat(t) {
    reset(t);
    ground(t, 520);
  },

  // 第三课 · 手雷：坑底靶子，必须把会弹跳的手雷扔进坑
  grenadePit(t) {
    reset(t);
    ground(t, 520);
    carve(t, 880, 520, 1120, 680);
  },

  // 第三课 · 集束：两个挨在一起的靶子
  cluster(t) {
    reset(t);
    ground(t, 520);
  },

  // 第三课 · 散弹枪：近距离平地
  shotgun(t) {
    reset(t);
    ground(t, 520);
  },

  // 第三课 · 钻地弹：带厚重顶盖的地堡，靶子躲在下面
  driller(t) {
    reset(t);
    ground(t, 520);
    rect(t, 1000, 400, 1250, 440);   // 顶盖
    rect(t, 1000, 440, 1012, 520);   // 左侧支柱
    rect(t, 1238, 440, 1250, 520);   // 右侧支柱
  },

  // 第三课 · 地形杀：左靶薄地临水，右靶站在水边
  terrainKill(t) {
    reset(t);
    t.waterY = 680;
    rect(t, 0, 520, 430, t.H - 1);        // 玩家所在高台
    rect(t, 650, 560, 800, 572);          // 左靶脚下的薄地面（12px）
    rect(t, 1020, 620, 1270, t.H - 1);    // 右岸（靶子站在离水边 8px 处）
  },

  // 第四课 · 补给与特殊武器：地面 + 需要喷气背包才能上去的高台
  supply(t) {
    reset(t);
    ground(t, 520);
    rect(t, 600, 330, 880, 360);        // 悬空高台（需要喷气背包飞上去）
    carve(t, 1080, 520, 1220, 639);     // 神圣靶的坑（把手雷的弹跳限制在坑里）
  },

  // 练习靶场：平地 + 两块可破坏的靶台
  range(t) {
    reset(t);
    ground(t, 520);
    rect(t, 1000, 470, 1160, 490);
    rect(t, 1540, 400, 1700, 430);
  },

  // 神圣一击挑战：一个宽而深的碗，接住会弹跳的神圣手雷
  holyBowl(t) {
    reset(t);
    ground(t, 520);
    carve(t, 1250, 520, 1580, 759);
  },
};
