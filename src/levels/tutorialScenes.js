// ============ 自定义地形（在程序生成之后覆写掩码） ============
// 教学关与挑战关共用（挑战关 c5 起通过 level.scene 引用）。
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

  // ============ 挑战关卡地形（c7 起；挑战关同样可以引用此表） ============

  // c7 空中庭园：谷底 + 三层浮岛逐级升高，练习高弧线仰攻
  skyGarden(t) {
    reset(t);
    rect(t, 0, 620, 400, t.H - 1);      // 左岸谷底
    rect(t, 1400, 620, t.W - 1, t.H - 1); // 右岸
    rect(t, 560, 540, 800, 566);        // 低台
    rect(t, 880, 450, 1140, 476);       // 中台
    rect(t, 720, 350, 980, 376);        // 顶台
  },

  // c8 双子尖塔：两座高塔夹一座 24px 薄桥，桥下全空直落水
  twinTowers(t) {
    reset(t);
    rect(t, 0, 600, 420, t.H - 1);      // 左岸
    rect(t, 1380, 600, t.W - 1, t.H - 1); // 右岸
    rect(t, 480, 260, 660, t.H - 1);    // 塔 A
    rect(t, 1140, 260, 1320, t.H - 1);  // 塔 B
    rect(t, 660, 300, 1140, 324);       // 薄桥
  },

  // c9 熔岩矿井：中台下挖两层嵌套坑，起始水位就贴着最底层
  lavaMine(t) {
    reset(t);
    rect(t, 0, 480, 640, t.H - 1);      // 左矿体
    rect(t, 1160, 480, t.W - 1, t.H - 1); // 右矿体
    rect(t, 640, 560, 1160, t.H - 1);   // 中台
    carve(t, 760, 560, 1040, 700);      // 坑 1（井）
    carve(t, 860, 700, 940, 820);       // 坑 2（深缝）
  },

  // c10 雪线天梯：六级梯田升 350px，70px 高差让 AI 死守各自平台
  summit(t) {
    reset(t);
    rect(t, 0, 660, 300, t.H - 1);
    rect(t, 240, 590, 560, t.H - 1);
    rect(t, 500, 520, 820, t.H - 1);
    rect(t, 760, 450, 1080, t.H - 1);
    rect(t, 1020, 380, 1340, t.H - 1);
    rect(t, 1280, 310, t.W - 1, t.H - 1);
  },

  // c11 油桶地狱：仓库薄板架在三根柱上，桶位由关卡数据 drumSpots 精摆
  drumDepot(t) {
    reset(t);
    rect(t, 0, 640, 380, t.H - 1);      // 左岸
    rect(t, 560, 600, 1500, 626);       // 仓库薄板
    rect(t, 560, 626, 590, t.H - 1);    // 三根支柱
    rect(t, 1020, 626, 1050, t.H - 1);
    rect(t, 1470, 626, 1500, t.H - 1);
    rect(t, 1620, 560, t.W - 1, t.H - 1); // 右高台
  },

  // c12 冰壶大师：整片冰场切三个全深水洞，散弹冲撞把敌人推进洞
  iceRink(t) {
    reset(t);
    rect(t, 0, 620, t.W - 1, t.H - 1);  // 冰场
    carve(t, 420, 620, 500, t.H - 1);   // 小洞
    carve(t, 700, 620, 850, t.H - 1);   // 中洞
    carve(t, 1150, 620, 1330, t.H - 1); // 大洞
  },

  // c13 围城攻坚：城堡厚墙 + 内室 + 左右箭窗（40px），守军从窗内反击
  fortress(t) {
    reset(t);
    rect(t, 0, 640, 520, t.H - 1);      // 城外左岸
    rect(t, 760, 380, 1080, t.H - 1);   // 城堡实心块
    carve(t, 800, 560, 1040, 860);      // 内室（地板 860）
    carve(t, 760, 620, 800, 652);       // 左箭窗
    carve(t, 1040, 620, 1080, 652);     // 右箭窗
    rect(t, 1320, 600, t.W - 1, t.H - 1); // 城外右岸
  },

  // c14 巨虫首领：开阔竞技场 + 王座高台 + 可破坏的中央矮墙
  bossArena(t) {
    reset(t);
    rect(t, 0, 620, 520, t.H - 1);      // 左岸（玩家区）
    rect(t, 1280, 620, t.W - 1, t.H - 1); // 右岸
    rect(t, 860, 540, 1120, t.H - 1);   // 王座高台（BOSS 站顶）
    rect(t, 700, 580, 820, 604);        // 左侧副官小台
    rect(t, 640, 560, 700, t.H - 1);    // 中央矮墙（24px 薄，可炸开/翻越）
  },

  // c15 坑道战：整图封死在地底，两层坑道 + 竖井 + 薄墙隔间
  warrens(t) {
    reset(t);
    ground(t, 360);                     // 全图 360 以下实心（顶盖封闭）
    carve(t, 80, 640, 1720, 740);       // 下层主坑道（100px 高）
    carve(t, 240, 480, 1560, 560);      // 上层坑道（80px 高）
    carve(t, 500, 560, 560, 640);       // 三条竖井连接上下层
    carve(t, 900, 560, 960, 640);       //   （单跳 89px 可爬上去）
    carve(t, 1300, 560, 1360, 640);
    rect(t, 700, 640, 724, 740);        // 下层两道 24px 薄墙（可炸穿）
    rect(t, 1120, 640, 1144, 740);
    rect(t, 1000, 480, 1024, 560);      // 上层一道薄墙
    carve(t, 600, 740, 700, 800);       // 下层房间里的陷阱坑
  },

  // c16 火力覆盖：对称开阔地 + 两个开局掩体土墩
  bombard(t) {
    reset(t);
    ground(t, 560);
    rect(t, 260, 508, 360, 559);        // 开局土墩（很快会被炸掉）
    rect(t, 1440, 508, 1540, 559);
  },
};
