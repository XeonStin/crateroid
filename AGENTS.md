# AGENTS.md — 弹坑星球 CRATEROID

回合制炮术虫虫对战（百战天虫 / 弹弹堂 like）。纯静态站点：**无构建、无依赖安装、无后端**，PixiJS v8 已内置于 `vendor/`。

## 启动

```bash
python serve.py            # 默认 5610，绑定 0.0.0.0（手机连同一 Wi-Fi 直接玩）
# 本机 http://127.0.0.1:5610/   ·   局域网地址启动时打印
```

线上：https://xeonstin.github.io/crateroid/ （GitHub Pages 静态托管，推送 `main` 自动生效）

## 目录结构

```
index.html / style.css          UI 骨架与全部样式（DOM 层）
serve.py                        本地静态服务器（/__save 截图落盘、/healthz）
src/
  main.js                       引导、Pixi 初始化、固定步长主循环、输入接线、调试面板
  config.js                     全部常量：世界尺寸、物理、武器表、主题表、难度、成就
  core/
    game.js                     对局主控：回合状态机、伤害/爆炸、回合流转、统计、成就
    camera.js                   跟随/缩放/震动/边界钳制
    input.js                    键鼠+触摸统一输入（pointer/touch 双实现、右键取消、双击冲刺）
    touch.js                    虚拟按键（仅触屏构建）
    audio.js                    WebAudio 程序化 SFX + chiptune BGM
    save.js                     localStorage 存档（设置/战绩/成就/教学/挑战评级）
  world/
    terrain.js                  地形：程序生成 + Uint8Array 掩码 + 分块纹理（脏瓦片更新）+ 装饰物
    water.js                    水面/岩浆（30fps 波浪 + 上涨）
    sky.js                      星空/云/极光/火星视差
  entities/
    worm.js                     虫虫：移动物理、队伍外观、表情、眩晕星星、背水 buff
    projectile.js               投射物：真实对战与 AI 模拟共用积分器；飞机
    crate.js                    补给箱伞降
    particles.js                Sprite 池粒子
  weapons/index.js              发射入口：抛射/瞬发霰弹/目标标记/弹道预览
  ai/
    planner.js                  状态克隆 + 候选弹道模拟 + 评分（与真实物理共用积分）
    brain.js                    难度人格：分帧搜索、走位、瞄准演出、撤退
  ui/hud.js                     对局 HUD（DOM）：计时/风/武器栏/力度条/横幅/结算/成就 toast
  ui/menus.js                   全部菜单：标题/组队/选图/教学/挑战/战绩/设置/暂停
  levels/challenges.js          6 个挑战关卡数据
  levels/tutorials.js           5 课教学关卡数据
vendor/pixi.min.js              PixiJS v8（ESM，importmap 映射 'pixi.js'）
```

## 架构要点

- **渲染**：PixiJS v8（WebGL2→WebGL），游戏世界在 `camera.applyTo(layers.world)` 变换的容器里；UI 全部 DOM 覆盖层。
- **主循环**：`app.ticker` 驱动固定步长 1/60，累积器最多 6 步/帧；不以 `document.hidden` 门控（WebView 会误报）；rAF 停转 >400ms 用 `setInterval` 补步进。
- **物理自研**：重力 900、风、圆碰撞；投射物每步 4 子步。
- **地形**：`mask: Uint8Array(W*H)` 为唯一权威；渲染层 6 块瓦片（600×675），爆炸只重画相交瓦片并 `texture.source.update()`。装饰物烘焙在纹理里，随地形一起被炸掉。
- **AI**：`makeSim()` 复制掩码 + 虫虫状态 → 与真实投射物共用 `Projectile.step` → 网格候选（角度×力度）× 迭代细化 → 评分（敌伤 − 2.2×友伤 − 1.9×自伤 + 击杀 + 落点靠近敌人）。分帧 14 次模拟/步，困难档加走位/撤退。
- **回合状态机**：`turnStart → active → projectile（含 5s 撤退）→ postturnWait → nextTurn`；看门狗 10s 强制推进。
- **存档**：`localStorage['crateroid.save.v1']`，`loadSave()` 深合并默认值。

## 调试与自动化

- URL 参数：`?debug=1`（左下调试面板）、`?quick=1`（秒开局）、`?auto=1`（双方 AI 自动对战）、`?diff=easy|normal|hard`、`?theme=islands|desert|snow|lava`、`?touch=1|0`（强制触屏/桌面）。
- 自动化钩子（`window.__crateroid`）：`game`、`menus`、`camera`、`planner`、`state()`、`startQuick(diff, theme)`、`screenshot(name)`（仅本地 serve.py 有效）。
- **快进测试法**（后台标签页 rAF 停转时唯一可靠方式）：
  ```js
  await page.evaluate(() => { const g = window.__crateroid.game; for (let i=0;i<300;i++) g.update(1/60); });
  ```
- 输入合成：canvas 上 dispatch `PointerEvent`（`pointerType:'mouse'|'touch'`）；右键取消必须用 `contextmenu` / `mousedown(button=2)`（见坑 1）。
- 渲染验证：`g.app.renderer.render(g.app.stage)` 必须无异常（隐藏页不渲染，截图前强制一次）。

## 修改后验证清单（最低要求）

1. `?debug=1&quick=1` 开局 → `window.__errs` 为空、`hasCrateroid` true。
2. 打两局（含爆炸/粒子/换图）→ `renderer.render` 不抛错。
3. 快进一整局 AI 对战 → 正常分出胜负、`g.matchStats` 有数。
4. 触屏模式（`?touch=1` 844×390）：弹弓拖拽出弹道点、松手发射、虚拟键行走。
5. AI 回合耗时：`g.update` 均值应 <0.1ms（当前基线 0.02ms）。

## 关键坑（改代码前必读）

1. **右键取消**：鼠标按住左键时再按右键，浏览器**不派发 `pointerdown`**（规范如此），必须监听 `contextmenu` + `mousedown(button===2)`。
2. **粒子共享纹理**：`particles.js` 的圆点纹理是模块级共享的；换局清理**绝不能** `destroy({texture:true})` 粒子层，否则第二局首弹渲染每帧抛 `alphaMode of null`、画布冻结（曾据此造成「换图后镜头必飞」）。
3. **相机钳制**：`follow()` 每帧覆写目标，钳制必须同时作用于**当前位置**（`_bounds()` 顶部留 220px 天空余量）。
4. **固定步长重复调用**：`update()` 内任何「每帧重建」逻辑（Graphics、DOM 写入、transform set）都要做变化检测，否则返回值放大 6 倍。
5. **`?quick` 开局时机**：`startQuick` 在 boot 后 300ms 才跑；调试面板函数需容忍 `wind/turnCount` 未初始化。
6. **MIME**：GitHub Pages 与本地 serve.py 都以 `.js` 提供模块；`vendor/pixi.min.js` 是 ESM 但扩展名故意为 `.js`，改回 `.mjs` 前先确认托管方 MIME。
7. **AI 武器池**：必须按 `ammo > 0` 过滤（教学关靠全 0 弹药实现被动靶子）。
8. **回合切换**：必须清空所有虫虫的 `walkDir/wantJump/wantJet/dashT`，否则旧虫会继续走。
9. **教学/挑战**：都走 `Menus.challengeConfig()`；教学数据带 `tutorial:true`，不计战绩/成就，完成写 `save.tutorials`。

## 发布

```bash
git add -A && git commit -m "..." && git push origin main
```

GitHub Pages：仓库 `xeonstin/crateroid`，`main` 分支根目录。推送后约 1 分钟生效。
线上环境无 `serve.py`：`screenshot()` 的 `POST /__save` 会 404（仅调试用，不影响游戏）。
