// ============ 教学关卡：分场景 + 分步骤的引导式课程 ============
// 每关由若干 stages 组成；每个 stage 有自己的地形场景、靶子与步骤（steps）。
// 步骤由 TutorialDirector 逐条推进；完成条件是「教学目标」而不是打死靶子。
const A = (o = {}) => ({
  bazooka: 0, grenade: 0, cluster: 0, shotgun: 0,
  airstrike: 0, driller: 0, holy: 0, cow: 0, ...o,
});
const NO_AMMO = A();
const INF = Infinity;

// 当前正在瞄准时的角度/力度（桌面蓄力与触屏弹弓统一）
function aiming(d) {
  const g = d.game;
  if (g.slingshot) return { angle: g.slingshot.angle, power: g.slingshot.power };
  if (g.charging) {
    const c = g.currentWorm;
    return { angle: c?.aimAngle ?? 0, power: g.chargePower };
  }
  return null;
}

function enemyMarker(d, i, label = '目标') {
  const t = d.enemies[i];
  if (!t) return null;
  return { x: t.x, y: t.bodyY - 12, label, color: 0xffd23d };
}
function enemyHit(d, i, ids, sinceKey) {
  const t = d.enemies[i];
  if (!t) return false;
  const since = d.vars[sinceKey] ?? 0;
  return t.hitLog.slice(since).some((w) => ids.includes(w));
}
function enemyKilled(d, i, ids) {
  const t = d.enemies[i];
  return !!t && !t.alive && ids.includes(t.lastHitWeapon);
}
function anyKilledBy(d, ids) {
  return d.enemies.some((t) => !t.alive && ids.includes(t.lastHitWeapon));
}
function noteHitBase(d, i, key) {
  d.vars[key] = d.enemies[i]?.hitLog.length ?? 0;
}
function crateMarker(d, kind) {
  const c = d.crateOf(kind);
  if (!c || !c.alive) return null;
  return { x: c.x, y: c.y - 26, label: kind === 'kit' ? '装备补给' : '补血补给', color: 0xffb545 };
}

export const TUTORIALS = [
  // ============================================================
  // 第一课：移动与跳跃
  // ============================================================
  {
    id: 'tut-move', icon: '🚶', name: '第一课：移动与跳跃',
    desc: '左右移动 / 跳跃 / 二段跳 / 斜向跳 / 冲刺 / 视角移动 / 缩放 / 到达终点',
    tutorial: true,
    stages: [{
      theme: 'islands', seed: 11101, scene: 'pit',
      name: '大坑',
      bannerTitle: '🚶 第一课：移动与跳跃',
      bannerSub: '先在大坑里练习，再用二段跳出去',
      intro: '欢迎入学！你被困在一个 140px 深的大坑里。单次跳跃只能上升约 89px，必须用二段跳才能出去。',
      player: { x: 690, name: '学员', color: '#4d96ff', hat: 'cap' },
      enemies: [],
      ammoPlayer: A({ bazooka: INF }),
      ammoEnemy: NO_AMMO,
      noCrates: true, noSuddenDeath: true,
      steps: [
        {
          id: 'walk', title: '① 左右移动',
          text: '按住 A / D 在坑里左右走动。手机上把左摇杆推向左/右。',
          touchText: '按住左下角摇杆，向左/向右推即可在坑里走动。',
          keys: ['A / D', '移动'], touchKeys: ['左摇杆 左右推', '移动'],
          goal: '向左、向右各走一段距离',
          check: (d) => (d.vars.minRel ?? 0) <= -35 && (d.vars.maxRel ?? 0) >= 35,
        },
        {
          id: 'jump', title: '② 跳跃',
          text: '按 W 或空格起跳（手机按 ⤒）。跳一次试试，注意高度只有约 89px。',
          touchText: '按 ⤒ 跳一次试试，单次跳跃只能上升约 89px。',
          keys: ['W / 空格', '跳跃'], touchKeys: ['⤒', '跳跃'],
          goal: '完成一次跳跃',
          check: (d) => d.hasEvent('jump'),
        },
        {
          id: 'double', title: '③ 斜向二段跳',
          text: '先按 W / 空格起跳，在空中再按一次跳跃 = 二段跳。起跳后按住 D（手机按住 ▶）就能斜向跳出坑。',
          touchText: '先按 ⤒ 起跳，空中再按一次 ⤒ = 二段跳；同时把左摇杆推向右边斜向飞出坑。',
          keys: ['W / 空格 ×2', '空中按住 D'], touchKeys: ['⤒ ×2', '空中左摇杆推右'],
          goal: '用二段跳跳到大坑外面',
          marker: { x: 810, y: 512, label: '从这边出去', color: 0x6bd968 },
          check: (d) => {
            const p = d.player;
            return !!p && p.onGround && p.y <= 540 && (p.x < 555 || p.x > 765);
          },
        },
        {
          id: 'dash', title: '④ 冲刺',
          text: '在平地上快速双击 D（手机快速双击 ▶）即可冲刺。冲刺每回合 1 次，用来快速转移或躲爆炸。',
          touchText: '点蓄力摇杆左边的 💨 冲刺按钮即可冲刺（沿当前移动方向）。冲刺每回合 1 次，用来快速转移或躲爆炸。',
          keys: ['双击 D', '冲刺'], touchKeys: ['💨 冲刺按钮', '冲刺'],
          goal: '使用一次冲刺',
          enter: (d) => {
            d.game.dashLeft = Math.max(1, d.game.dashLeft);
            d.game.hud.setDash(d.game.dashLeft, d.game.dashMax || 1);
          },
          check: (d) => d.hasEvent('dash'),
        },
        {
          id: 'cameraPan', title: '⑤ 移动视角',
          text: '按住鼠标中键拖动（或按住 Shift 再按左键拖动）可以平移视角。手机上用两根手指同时拖动屏幕。',
          touchText: '单指按住屏幕拖动，即可平移视角。',
          keys: ['中键拖动 / Shift+左键', '移动视角'], touchKeys: ['单指拖动', '移动视角'],
          goal: '平移一次视角',
          check: (d) => d.hasEvent('cameraPan', (x) => Math.abs(x.dx) + Math.abs(x.dy) > 2),
        },
        {
          id: 'cameraZoom', title: '⑥ 缩放视角',
          text: '滚动鼠标滚轮缩放视角。注意：按住左键瞄准时滚轮是微调力度，想缩放请先松开左键。手机上双指捏合/张开缩放。',
          touchText: '双指张开放大、捏合缩小；缩到最小可以看全地图。',
          keys: ['滚轮', '缩放'], touchKeys: ['双指张开/捏合', '缩放'],
          goal: '缩放一次视角',
          check: (d) => d.hasEvent('cameraZoom'),
        },
        {
          id: 'goal', title: '⑦ 走到终点',
          text: '沿着平地走到右侧的终点旗杆，本课就完成了。',
          keys: ['A / D', '行走'], touchKeys: ['左摇杆', '行走'],
          goal: '走到终点旗杆',
          marker: { x: 1240, y: 512, label: '终点', color: 0x6bd968 },
          check: (d) => {
            const p = d.player;
            return !!p && p.onGround && Math.abs(p.x - 1240) < 48;
          },
        },
      ],
    }],
  },

  // ============================================================
  // 第二课：瞄准与力度
  // ============================================================
  {
    id: 'tut-aim', icon: '🎯', name: '第二课：瞄准与力度',
    desc: '拖拽瞄准 / 力度控制 / 滚轮微调 / 取消瞄准 / 命中靶子',
    tutorial: true,
    stages: [{
      theme: 'desert', seed: 22202, scene: 'aim',
      name: '靶场',
      bannerTitle: '🎯 第二课：瞄准与力度',
      bannerSub: '本课无风：先把角度和力度练准',
      intro: '靶子在 750px 外。火箭弹会受重力影响，抬高炮口才能打远；白色圆点是预计弹道。',
      player: { x: 300, name: '学员', color: '#4d96ff', hat: 'tophat' },
      enemies: [{ x: 1050, name: '靶子', color: '#ef476f', hat: 'bow', hp: 100 }],
      ammoPlayer: A({ bazooka: INF }),
      ammoEnemy: NO_AMMO,
      noCrates: true, noSuddenDeath: true, respawn: true,
      steps: [
        {
          id: 'drag', title: '① 拖拽瞄准',
          text: '按住鼠标左键并拖动瞄准（手机：推右下角蓄力摇杆，方向=发射方向）。把角度抬到 45° 左右，HUD 会显示角度。',
          touchText: '把右下角蓄力摇杆斜向上推：摇杆方向就是发射方向，推到 45° 左右。HUD 会显示角度。',
          keys: ['按住左键拖动', '瞄准'], touchKeys: ['右摇杆方向', '瞄准'],
          goal: '把瞄准角度调到 38°~55°',
          check: (d) => {
            const a = aiming(d);
            return !!a && a.angle >= 38 && a.angle <= 55;
          },
        },
        {
          id: 'power', title: '② 控制力度',
          text: '鼠标离虫虫越远力度越大。按住不放，把力度拖到 50%~75% 之间。',
          touchText: '摇杆推得越远力度越大。把行程推到 50%~75%。',
          keys: ['拖拽距离', '力度'], touchKeys: ['摇杆行程', '力度'],
          goal: '把力度控制在 50%~75%',
          check: (d) => {
            const a = aiming(d);
            return !!a && a.power >= 0.5 && a.power <= 0.75;
          },
        },
        {
          id: 'wheel', title: '③ 滚轮微调',
          text: '按住左键蓄力时，滚动鼠标滚轮可以每次 ±2% 微调力度，适合最后校准。',
          keys: ['滚轮', '±2%'], touchKeys: ['上下拖动', '微调'],
          goal: '用滚轮微调一次力度',
          when: (g) => !g.mobile && (g.settings?.powerMode || 'drag') === 'drag',
          check: (d) => d.hasEvent('wheel'),
        },
        {
          id: 'fine', title: '③ 力度微调',
          text: '按住左键蓄力，等力度条经过 57%~65% 时松手；拖动瞄准时也可以慢慢微调距离。',
          touchText: '慢慢推杆，把力度调到 57%~65% 之间，练一练精细控制。',
          keys: ['蓄力', '微调'], touchKeys: ['慢慢推杆', '微调'],
          goal: '把力度调到 57%~65%',
          when: (g) => g.mobile || g.settings?.powerMode === 'hold',
          check: (d) => {
            const a = aiming(d);
            return !!a && a.power >= 0.57 && a.power <= 0.65;
          },
        },
        {
          id: 'cancel', title: '④ 取消瞄准',
          text: '不想打了？按 Esc 或点鼠标右键取消瞄准（手机：把摇杆拖到「取消蓄力」按钮上，或直接点按它）。取消不会消耗回合。',
          touchText: '不想打了？把蓄力摇杆拖到上方「取消蓄力」按钮上（或直接点按它），即可取消，不消耗回合。松手都会发射，哪怕力度很小。',
          keys: ['Esc / 右键', '取消'], touchKeys: ['取消蓄力按钮', '取消'],
          goal: '取消一次瞄准',
          check: (d) => d.hasEvent('cancelAim'),
        },
        {
          id: 'hit', title: '⑤ 命中靶子',
          text: '重新瞄准：角度 45° 左右、力度约 60%，松手发射，命中靶子！',
          keys: ['瞄准 + 松手', '发射'], touchKeys: ['推出摇杆松手', '发射'],
          goal: '用火箭弹命中靶子',
          marker: (d) => enemyMarker(d, 0, '打中它'),
          enter: (d) => noteHitBase(d, 0, 'hitBase'),
          check: (d) => enemyHit(d, 0, ['bazooka'], 'hitBase'),
        },
      ],
    }],
  },

  // ============================================================
  // 第三课：武器课（每个武器一个场景，最后是地形杀）
  // ============================================================
  {
    id: 'tut-weapons', icon: '🔫', name: '第三课：武器课',
    desc: '火箭弹 / 手雷 / 集束炸弹 / 散弹枪 / 钻地弹 / 地形杀（击退落水）',
    tutorial: true, skippable: true,
    stages: [
      {
        theme: 'islands', seed: 33301, scene: 'flat',
        name: '火箭弹',
        bannerTitle: '🚀 武器 1/5：火箭弹',
        bannerSub: '直线弹道，触地爆炸',
        intro: '武器库开放！火箭弹是基础武器：触地立刻爆炸，弹道会被重力拉弯。',
        player: { x: 300, name: '学员', color: '#4d96ff', hat: 'cap' },
        enemies: [{ x: 950, name: '靶子', color: '#ef476f', hat: 'bow', hp: 40 }],
        ammoPlayer: A({ bazooka: INF }),
        ammoEnemy: NO_AMMO,
        noCrates: true, noSuddenDeath: true, respawn: true,
        weaponTest: ['bazooka'], weaponName: '🚀 火箭弹',
        steps: [
          {
            id: 'fire', title: '① 发射火箭弹',
            text: '按住左键瞄准，松手发射。先把炮口抬高，让弹道落到靶子附近。',
            keys: ['按住瞄准', '松手发射'], touchKeys: ['摇杆瞄准', '松手发射'],
            goal: '发射一枚火箭弹',
            check: (d) => d.hasEvent('shot', (x) => x.weaponId === 'bazooka'),
          },
          {
            id: 'kill', title: '② 击倒靶子',
            text: '火箭弹触地爆炸，把爆炸范围覆盖到靶子身上。继续调整角度和力度，直到击倒它。',
            keys: ['瞄准 + 力度', '爆炸'], touchKeys: ['摇杆瞄准', '爆炸'],
            goal: '用火箭弹击倒靶子',
            marker: (d) => enemyMarker(d, 0, '火箭弹靶'),
            check: (d) => enemyKilled(d, 0, ['bazooka']),
          },
        ],
      },
      {
        theme: 'islands', seed: 33302, scene: 'grenadePit',
        name: '手雷',
        bannerTitle: '💣 武器 2/5：手雷',
        bannerSub: '会弹跳，3 秒引信',
        intro: '手雷不会一碰就炸：它会在坑壁之间弹跳，3 秒后才爆炸。把坑沿当成墙，把手雷扔进坑底。',
        player: { x: 340, name: '学员', color: '#4d96ff', hat: 'bandana' },
        enemies: [{ x: 1000, y: 681, name: '靶子', color: '#ef476f', hat: 'bow', hp: 14 }],
        ammoPlayer: A({ bazooka: INF, grenade: INF }),
        ammoEnemy: NO_AMMO,
        noCrates: true, noSuddenDeath: true, respawn: true,
        weaponTest: ['grenade'], weaponName: '💣 手雷',
        steps: [
          {
            id: 'select', title: '① 切换到手雷',
            text: '按数字键 2 选择 💣 手雷（手机：点武器栏里的 💣）。注意武器栏里每件武器左上角都有编号。',
            touchText: '点底部武器栏里的 💣 手雷。',
            keys: ['2', '切换武器'], touchKeys: ['点武器栏 💣', '切换'],
            goal: '选中手雷',
            check: (d) => d.game.selectedWeapon === 'grenade',
          },
          {
            id: 'kill', title: '② 把手雷扔进坑',
            text: '抬高炮口越过坑沿，把手雷扔到坑底靶子附近。手雷会弹跳，等 3 秒引信爆炸。',
            keys: ['高抛', '引信 3s'], touchKeys: ['高抛', '引信 3s'],
            goal: '用手雷击倒坑底的靶子',
            marker: (d) => enemyMarker(d, 0, '坑底靶子'),
            check: (d) => enemyKilled(d, 0, ['grenade']),
          },
        ],
      },
      {
        theme: 'islands', seed: 33303, scene: 'cluster',
        name: '集束炸弹',
        bannerTitle: '🧨 武器 3/5：集束炸弹',
        bannerSub: '落地分裂成 5 颗子雷',
        intro: '集束炸弹落地后会分裂成 5 颗小雷，覆盖一大片区域，特别适合敌人扎堆时使用。',
        player: { x: 300, name: '学员', color: '#4d96ff', hat: 'helmet' },
        enemies: [
          { x: 995, name: '靶子A', color: '#ef476f', hat: 'bow', hp: 14 },
          { x: 1055, name: '靶子B', color: '#f78c6b', hat: 'cap', hp: 14 },
        ],
        ammoPlayer: A({ bazooka: INF, cluster: INF }),
        ammoEnemy: NO_AMMO,
        noCrates: true, noSuddenDeath: true, respawn: true,
        weaponTest: ['cluster', 'bomblet'], weaponName: '🧨 集束炸弹',
        steps: [
          {
            id: 'select', title: '① 切换到集束炸弹',
            text: '按数字键 3 选择 🧨 集束炸弹（手机：点武器栏）。',
            touchText: '点底部武器栏里的 🧨 集束炸弹。',
            keys: ['3', '切换武器'], touchKeys: ['点武器栏 🧨', '切换'],
            goal: '选中集束炸弹',
            check: (d) => d.game.selectedWeapon === 'cluster',
          },
          {
            id: 'kill', title: '② 用子雷覆盖靶群',
            text: '把集束炸弹扔到两个靶子中间，落地分裂的 5 颗子雷会覆盖整片区域。击倒任意一个靶子即可。',
            keys: ['落点居中', '子雷覆盖'], touchKeys: ['落点居中', '子雷覆盖'],
            goal: '用集束炸弹击倒一个靶子',
            marker: (d) => {
              const a = d.enemies[0], b = d.enemies[1];
              return a && b ? { x: (a.x + b.x) / 2, y: a.bodyY - 10, label: '炸中间', color: 0xff9f43 } : null;
            },
            check: (d) => anyKilledBy(d, ['cluster', 'bomblet']),
          },
        ],
      },
      {
        theme: 'islands', seed: 33304, scene: 'shotgun',
        name: '散弹枪',
        bannerTitle: '🔫 武器 4/5：散弹枪',
        bannerSub: '瞬发 · 5 颗弹丸 · 可打穿地形',
        intro: '散弹枪是瞬发武器，不用算弹道：一次打出 5 颗弹丸，近距离威力很大，还能在地形上打出小洞。',
        player: { x: 300, name: '学员', color: '#4d96ff', hat: 'helmet' },
        enemies: [{ x: 500, name: '靶子', color: '#ef476f', hat: 'bow', hp: 16 }],
        ammoPlayer: A({ bazooka: INF, shotgun: INF }),
        ammoEnemy: NO_AMMO,
        noCrates: true, noSuddenDeath: true, respawn: true,
        weaponTest: ['shotgun'], weaponName: '🔫 散弹枪',
        steps: [
          {
            id: 'select', title: '① 切换到散弹枪',
            text: '按数字键 4 选择 🔫 散弹枪（手机：点武器栏）。',
            touchText: '点底部武器栏里的 🔫 散弹枪。',
            keys: ['4', '切换武器'], touchKeys: ['点武器栏 🔫', '切换'],
            goal: '选中散弹枪',
            check: (d) => d.game.selectedWeapon === 'shotgun',
          },
          {
            id: 'kill', title: '② 近距离击倒靶子',
            text: '把瞄准线压平，正对近处的靶子，松手瞬发。5 颗弹丸散布成扇形，距离越近命中越多。',
            keys: ['瞄准压平', '瞬发'], touchKeys: ['瞄准压平', '瞬发'],
            goal: '用散弹枪击倒靶子',
            marker: (d) => enemyMarker(d, 0, '近距离靶子'),
            check: (d) => enemyKilled(d, 0, ['shotgun']),
          },
        ],
      },
      {
        theme: 'islands', seed: 33305, scene: 'driller',
        name: '钻地弹',
        bannerTitle: '⛏️ 武器 5/5：钻地弹',
        bannerSub: '钻进土里再爆炸，专治地堡',
        intro: '钻地弹命中地形后会向下钻 90px 再爆炸，能绕过顶盖打中躲在下面的敌人。',
        player: { x: 300, name: '学员', color: '#4d96ff', hat: 'cap' },
        enemies: [{ x: 1120, y: 520, name: '靶子', color: '#ef476f', hat: 'bow', hp: 12 }],
        ammoPlayer: A({ bazooka: INF, driller: INF }),
        ammoEnemy: NO_AMMO,
        noCrates: true, noSuddenDeath: true, respawn: true,
        weaponTest: ['driller'], weaponName: '⛏️ 钻地弹',
        steps: [
          {
            id: 'select', title: '① 切换到钻地弹',
            text: '按数字键 6 选择 ⛏️ 钻地弹（手机：点武器栏）。',
            touchText: '点底部武器栏里的 ⛏️ 钻地弹。',
            keys: ['6', '切换武器'], touchKeys: ['点武器栏 ⛏️', '切换'],
            goal: '选中钻地弹',
            check: (d) => d.game.selectedWeapon === 'driller',
          },
          {
            id: 'kill', title: '② 打穿地堡顶盖',
            text: '把钻地弹打到靶子正上方的顶盖。它钻穿土层后爆炸，正好波及地堡里的靶子。',
            keys: ['落在靶子上方', '钻 90px'], touchKeys: ['落在靶子上方', '钻 90px'],
            goal: '用钻地弹击倒地堡里的靶子',
            marker: (d) => {
              const t = d.enemies[0];
              return t ? { x: t.x, y: 396, label: '打顶盖', color: 0xff9f43 } : null;
            },
            check: (d) => enemyKilled(d, 0, ['driller']),
          },
        ],
      },
      {
        theme: 'islands', seed: 33306, scene: 'terrainKill',
        name: '地形杀',
        bannerTitle: '⛏️ 毕业考：地形杀',
        bannerSub: '炸穿薄地 · 击退落水',
        intro: '地形就是武器！爆炸既能挖掉脚下的土，也能用冲击波把人推走。落水即死，两个靶子都必须掉进水里。',
        player: { x: 250, name: '学员', color: '#4d96ff', hat: 'flower' },
        enemies: [
          { x: 725, y: 560, name: '左靶', color: '#ef476f', hat: 'bow', hp: 999 },
          { x: 1262, y: 620, name: '右靶', color: '#9b5de5', hat: 'bow', hp: 999 },
        ],
        ammoPlayer: A({ bazooka: INF }),
        ammoEnemy: NO_AMMO,
        noCrates: true, noSuddenDeath: true, respawn: false,
        steps: [
          {
            id: 'left', title: '① 炸穿薄地面',
            text: '左靶站在一层只有 12px 厚的薄土上，薄土下面是水。把火箭弹打到它脚下，炸穿薄土让它掉下去！',
            keys: ['瞄准脚下', '炸地形'], touchKeys: ['瞄准脚下', '炸地形'],
            goal: '让左靶掉进水里',
            marker: (d) => {
              const t = d.enemies[0];
              return t ? { x: t.x, y: t.y - 6, label: '炸薄地面', color: 0xff9f43 } : null;
            },
            check: (d) => !!d.enemies[0]?._drowned,
          },
          {
            id: 'right', title: '② 击退落水',
            text: '右靶站在水边。把爆炸打在它左边，利用冲击波把它向右推进水里。多试几次也没关系。',
            keys: ['炸左侧', '击退'], touchKeys: ['炸左侧', '击退'],
            goal: '把右靶击退进水里',
            marker: (d) => {
              const t = d.enemies[1];
              return t ? { x: t.x - 42, y: t.y - 10, label: '炸这里，推下水', color: 0xff9f43 } : null;
            },
            check: (d) => !!d.enemies[1]?._drowned,
          },
        ],
      },
    ],
  },

  // ============================================================
  // 第四课：补给 + 特殊武器
  // ============================================================
  {
    id: 'tut-special', icon: '🎒', name: '第四课：补给与特殊武器',
    desc: '补给箱 / 喷气背包 / 空袭 / 神圣手雷 / 奶牛空袭',
    tutorial: true,
    stages: [{
      theme: 'snow', seed: 44404, scene: 'supply',
      name: '补给与特殊武器',
      bannerTitle: '🎒 第四课：补给与特殊武器',
      bannerSub: '先捡补给，再逐件试玩',
      intro: '你只剩 15 HP。先捡身边的 ❤️ 补血箱和 🎒 装备箱；装备箱会给你喷气背包、空袭、神圣手雷和奶牛空袭。',
      player: { x: 320, y: 520, name: '学员', color: '#4d96ff', hat: 'helmet', hp: 15 },
      enemies: [
        { x: 980, name: '空袭靶', color: '#ef476f', hat: 'cap', hp: 120 },
        { x: 1150, y: 640, name: '神圣靶', color: '#9b5de5', hat: 'bow', hp: 120 },
        { x: 1350, name: '奶牛靶', color: '#f78c6b', hat: 'bandana', hp: 120 },
      ],
      ammoPlayer: A({ bazooka: INF }),
      ammoEnemy: NO_AMMO,
      noCrates: true, noSuddenDeath: true, respawn: true,
      scriptedCrates: [
        { kind: 'health', x: 240, payload: { heal: 25 } },
        {
          kind: 'kit', x: 430,
          payload: {
            jetFuel: 100,
            weapons: { airstrike: 3, holy: 3, cow: 3 },
          },
        },
      ],
      steps: [
        {
          id: 'health', title: '① 拾取补血补给',
          text: '走到左侧的 ❤️ 补血箱旁会自动拾取，回复 25 HP。补给箱会慢慢伞降，等它落地。',
          keys: ['A / D', '走过去'], touchKeys: ['◀ ▶', '走过去'],
          goal: '拾取补血补给箱',
          marker: (d) => crateMarker(d, 'health'),
          check: (d) => d.pickedKinds.has('health'),
        },
        {
          id: 'kit', title: '② 拾取装备补给',
          text: '再走到右侧的 🎒 装备箱，拾取后获得：喷气背包 + ✈️ 空袭 + 🐑 神圣手雷 + 🐮 奶牛空袭。',
          keys: ['A / D', '走过去'], touchKeys: ['◀ ▶', '走过去'],
          goal: '拾取装备补给箱',
          marker: (d) => crateMarker(d, 'kit'),
          check: (d) => d.pickedKinds.has('kit'),
        },
        {
          id: 'jetpack', title: '③ 喷气背包',
          text: '先按跳跃起跳，起跳后继续按住跳跃键垂直升空。升到高台上方后再按住 D 横移过去，松开跳跃键落到台上。二段跳上不去，喷气背包才行。',
          touchText: '先按 ⤒ 起跳，按住 ⤒ 垂直喷气；升到高台上方再把左摇杆推向右横移，松开 ⤒ 落到台上。',
          keys: ['起跳', '按住喷气', '松开 + D'], touchKeys: ['⤒ 起跳', '按住 ⤒', '左摇杆右移'],
          goal: '用喷气背包飞上高台',
          marker: { x: 740, y: 322, label: '飞上高台', color: 0x53c8ff },
          enter: (d) => {
            if (d.player) {
              d.player.jetFuel = 100;
              d.game.hud.setFuel(100);
              d.game.touch?.setJetMode(true);
            }
          },
          check: (d) => {
            const p = d.player;
            return !!p && p.onGround && p.y <= 345 && p.x >= 600 && p.x <= 890;
          },
          jetRefill: true,
        },
        {
          id: 'airstrike', title: '④ 空袭',
          text: '按 5 选择 ✈️ 空袭，然后点地图进入标记模式，再点一次确认落点。飞机会投下 5 颗炸弹。',
          touchText: '点武器栏选 ✈️ 空袭，轻点地图（或把蓄力摇杆轻推一下）进入标记模式，再点一次确认落点。可以先缩小看全图再召唤。',
          keys: ['5', '点地图两次'], touchKeys: ['点武器栏 ✈️', '推杆 + 点地图'],
          goal: '用空袭命中「空袭靶」',
          ammoId: 'airstrike',
          marker: (d) => enemyMarker(d, 0, '空袭靶'),
          enter: (d) => {
            d.ensureAmmo('airstrike', 3);
            noteHitBase(d, 0, 'hitBase');
          },
          check: (d) => enemyHit(d, 0, ['bomb', 'airstrike'], 'hitBase'),
        },
        {
          id: 'holy', title: '⑤ 神圣手雷',
          text: '按 7 选择 🐑 神圣手雷。它和普通手雷一样会碰撞弹跳，3 秒引信；爆炸半径高达 84，把坑里的「神圣靶」覆盖住即可。',
          touchText: '点武器栏选 🐑 神圣手雷，扔进「神圣靶」所在的坑里；它和普通手雷一样弹跳 3 秒后爆炸，半径 84，覆盖面很大。',
          keys: ['7', '超大爆炸'], touchKeys: ['点武器栏 🐑', '超大爆炸'],
          goal: '用神圣手雷命中任意靶子',
          ammoId: 'holy',
          marker: (d) => enemyMarker(d, 1, '神圣靶'),
          enter: (d) => {
            d.ensureAmmo('holy', 3);
          },
          check: (d) => d.hasEvent('damage', (x) => x.weaponId === 'holy' && x.worm?.team === 1),
        },
        {
          id: 'cow', title: '⑥ 奶牛空袭',
          text: '按 8 选择 🐮 奶牛空袭，点地图选落点。奶牛会从天而降，一路弹跳碾压 5 次。',
          touchText: '点武器栏选 🐮 奶牛空袭，蓄力摇杆轻推进入标记，再点地图选落点。奶牛会一路弹跳碾压。',
          keys: ['8', '点地图'], touchKeys: ['点武器栏 🐮', '推杆 + 点地图'],
          goal: '用奶牛空袭命中「奶牛靶」',
          ammoId: 'cow',
          marker: (d) => enemyMarker(d, 2, '奶牛靶'),
          enter: (d) => {
            d.ensureAmmo('cow', 3);
            noteHitBase(d, 2, 'hitBase');
          },
          check: (d) => enemyHit(d, 2, ['cow'], 'hitBase'),
        },
      ],
    }],
  },

  // ============================================================
  // 练习靶场
  // ============================================================
  {
    id: 'tut-range', icon: '♾️', name: '练习靶场',
    desc: '无限弹药 / 靶子会复活 / 永远是你的回合',
    tutorial: true, practice: true,
    stages: [{
      theme: 'islands', seed: 55505, scene: 'range',
      name: '练习靶场',
      bannerTitle: '🎯 练习靶场',
      bannerSub: '无限弹药 · 靶子会复活 · 永远是你的回合',
      intro: '随便打！所有武器弹药无限，靶子被打倒后 2 秒会原地复活，没有回合倒计时。',
      player: { x: 300, name: '学员', color: '#4d96ff', hat: 'cap' },
      enemies: [
        { x: 780, name: '靶子1', color: '#ef476f', hat: 'bow', hp: 100 },
        { x: 1080, y: 470, name: '靶子2', color: '#f78c6b', hat: 'cap', hp: 100 },
        { x: 1380, name: '靶子3', color: '#9b5de5', hat: 'bandana', hp: 100 },
        { x: 1620, y: 400, name: '靶子4', color: '#06d6a0', hat: 'helmet', hp: 100 },
      ],
      ammoPlayer: A({
        bazooka: INF, grenade: INF, cluster: INF, shotgun: INF,
        airstrike: INF, driller: INF, holy: INF, cow: INF,
      }),
      ammoEnemy: NO_AMMO,
      noCrates: true, noSuddenDeath: true, respawn: true,
      steps: [],
    }],
  },
];
