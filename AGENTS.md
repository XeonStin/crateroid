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
    tutorial.js                 教学导演：分步目标、持久提示面板、世界标记、场景切换
    camera.js                   跟随/缩放/震动/边界钳制
    input.js                    键鼠+触摸统一输入（右键取消、双击冲刺、中键/Shift 平移、双指平移缩放）
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
  levels/tutorials.js           教学关卡数据：4 课分阶段步骤 + 练习靶场
  levels/tutorialScenes.js      教学专用地形覆写（深坑/武器场景/地形杀/补给高台/靶场）
vendor/pixi-loader.js            PixiJS v8 运行时加载器（拼接 vendor/pixi/*.bin）
vendor/pixi/*.bin                PixiJS 分片（12 片，importmap 映射 'pixi.js'）
```

## 架构要点

- **渲染**：PixiJS v8（WebGL2→WebGL），游戏世界在 `camera.applyTo(layers.world)` 变换的容器里；UI 全部 DOM 覆盖层。
- **主循环**：`app.ticker` 驱动固定步长 1/60，累积器最多 6 步/帧；不以 `document.hidden` 门控（WebView 会误报）；rAF 停转 >400ms 用 `setInterval` 补步进。
- **物理自研**：重力 900、风、圆碰撞；投射物每步 4 子步。
- **地形**：`mask: Uint8Array(W*H)` 为唯一权威；渲染层 6 块瓦片（600×675），爆炸只重画相交瓦片并 `texture.source.update()`。装饰物烘焙在纹理里，随地形一起被炸掉。
- **AI**：`makeSim()` 复制掩码 + 虫虫状态 → 与真实投射物共用 `Projectile.step` → 网格候选（角度×力度）× 迭代细化 → 评分（敌伤 − 2.2×友伤 − 1.9×自伤 + 击杀 + 落点靠近敌人）。分帧 14 次模拟/步，困难档加走位/撤退。
- **回合状态机**：`turnStart → active → projectile（含 5s 撤退）→ postturnWait → nextTurn`；看门狗 10s 强制推进。
- **教学系统**：`TUTORIALS` 每课由若干 `stages` 组成（每关可换地形/靶子/弹药），`TutorialDirector` 逐条检查 `steps[].check`；右侧 `#tut-panel` 常驻显示步骤、键位、当前目标，不自动消失；完成后由目标达成推进/切场景，不靠 `_checkWin`。教学/练习模式强制 `team=0`（没有靶子回合）、回合无限时、无突死；靶子可 `respawn`（死亡 2s 后原地复活）。多场景课程可设 `skippable:true`，面板头部出现「跳过场景」（最后一关隐藏）。
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
- 教学快进：`g.tutorial.stepIndex` / `g.tutorial.pickedKinds`；直接跳到第 N 个场景：
  ```js
  g.startMatch(g.menus.challengeConfig(g.tutorialLevel, 5)); // 0-based
  ```
  触屏弹弓可直接调 `g.onAimDrag(dx,dy)`、`g.onAimRelease(dx,dy)`；桌面蓄力可调 `g.onAimMove/onChargeStart/onChargeEnd`。

## 修改后验证清单（最低要求）

1. `?debug=1&quick=1` 开局 → `window.__errs` 为空、`hasCrateroid` true。
2. 打两局（含爆炸/粒子/换图）→ `renderer.render` 不抛错。
3. 快进一整局 AI 对战 → 正常分出胜负、`g.matchStats` 有数。
4. 触屏模式（`?touch=1` 844×390）：弹弓拖拽出弹道点、松手发射、虚拟键行走；教学面板不压住武器栏。
5. 教学 4 课 + 练习靶场：每步 `#tut-title` 与 `#tp-goal` 正确推进；场景切换后 `__errs` 为空；练习靶场靶子死亡 2s 后复活且回合始终为玩家。
6. AI 回合耗时：`g.update` 均值应 <0.1ms（当前基线 0.02ms）。

## 关键坑（改代码前必读）

1. **右键取消**：鼠标按住左键时再按右键，浏览器**不派发 `pointerdown`**（规范如此），必须监听 `contextmenu` + `mousedown(button===2)`。
2. **粒子共享纹理/对象池**：`particles.js` 的圆点纹理与 420 个 Sprite 跨局复用；换局时 `Game.startMatch` 必须跳过销毁粒子层，只调用 `particles.clear()` 并重新 `addChild`。销毁会触发 `alphaMode of null` 并让第二局冻结（曾造成「换图后镜头必飞」）。
3. **相机钳制**：`follow()` 每帧覆写目标，钳制必须同时作用于**当前位置**（`_bounds()` 顶部留 220px 天空余量）。
4. **固定步长重复调用**：`update()` 内任何「每帧重建」逻辑（Graphics、DOM 写入、transform set）都要做变化检测，否则返回值放大 6 倍。
5. **`?quick` 开局时机**：`startQuick` 在 boot 后 300ms 才跑；调试面板函数需容忍 `wind/turnCount` 未初始化。
6. **MIME / vendor**：GitHub Pages 与本地 serve.py 都以 `.js` 提供模块；`vendor/pixi-loader.js` 是 ESM，`vendor/pixi/*.bin` 由它拼接后动态 import。不要合并回单个大文件（上传受限）或改扩展名，除非确认托管方 MIME。
7. **AI 武器池**：必须按 `ammo > 0` 过滤（教学关靶子全 0 弹药，且 `tutorialLike` 强制玩家回合）。
8. **回合切换**：必须清空所有虫虫的 `walkDir/wantJump/wantJet/dashT`，否则旧虫会继续走；教学步骤完成时也要清，避免过场滑步。
9. **教学/挑战**：都走 `Menus.challengeConfig(lv, stageIndex)`；教学数据带 `tutorial:true`，不计战绩/成就，完成写 `save.tutorials`。教学完成由 `TutorialDirector` 的目标达成判定，不靠 `_checkWin`。
10. **教学面板**：`#tut-panel` 及其子元素必须 `pointer-events:none`，否则会吞掉画布拖拽；提示文本常驻，不要改成会 fade 的 `hud.message`。
11. **教学靶子复活**：`Worm.revive()` 必须先 `new PIXI.Container()` 再 `buildView()`（`buildView` 是往已有 view 里加子节点，不是重建容器）；复活后记得 `layers.ents.addChild(worm.view)`。
12. **投射物 explode 后视图**：`Projectile.explode()` 要 `this.view.destroy(); this.view = null`，且 `step()` 在子步爆炸后要早退，否则奶牛最后一次弹跳会在拖尾里访问已销毁的 view。
13. **教学玩家保护**：教学/练习里玩家伤害最低留 1 HP，落水会被捞回起点；否则学员阵亡会导致 `nextTurn` 找不到可操作虫虫而卡死。
14. **喷气背包**：`Worm.step` 里上升速度要封顶（-360），且必须先起跳再喷气（`!onGround`），否则按住地面会白耗燃料；高台最好留出侧向起飞空间。
15. **0 弹药约束**：`Game.fireWeapon` 必须检查 `ammoPool[team][weaponId] > 0`；`nextTurn` 在默认火箭弹没弹时自动选第一件可用武器（挑战关 c2/c4/c5 依赖此逻辑）。
16. **散弹枪连射**：每回合 2 发用 `_shotgunUsedThisTurn` 记录；重复点同一武器不能刷新 `shotsLeft`，`nextTurn` 才重置。
17. **存档写入**：高频伤害用 300ms 合并的 `persist()`；通关/成就/评级/重置用 `persistNow()`，并依赖 `pagehide/beforeunload/visibilitychange` 兜底。不要把 `persist` 改回每次同步写。
18. **队伍 pips**：一次爆炸可能命中多只虫，`damageWorm/killWorm/drownWorm/reviveWorm` 只置 `_pipsDirty`，由 `Game.update` 每帧最多重建一次 DOM。
19. **天空太阳**：`Sky.update` 需要 `camera.viewW` 才能按屏幕宽度放置太阳/月亮；`Game.update` 必须传第三个参数。
20. **设置钩子**：`Menus` 的 hooks 必须带 `game`（震屏/瞄准模式/今日种子会用到），漏传会在点击设置时报 `undefined`。
21. **弹跳类与虫体碰撞**：手雷/神圣手雷（`bounce:true`）撞到虫虫必须走 `Projectile.bounceOffWorm` 弹开，而不是穿过或立即爆炸；非弹跳弹种才走直接爆炸。
22. **奶牛地形破坏**：`Game.cowStomp` 每次落地都要 `terrain.carve`；AI 模拟不复制地形破坏，只按真实物理打伤害。
23. **视角教学事件**：中键/Shift+左键/双指拖动走 `Game.onPan` 并触发 `cameraPan`；滚轮/双指捏合走 `Game.onZoom` 并触发 `cameraZoom`。不要恢复旧 `onPan` 的 aimMode 拦截，否则第一课视角步骤无法完成。
24. **冲刺指示**：HUD 的 `#dash-ind` 由 `setDash(left,max)` 更新；`nextTurn` 重置、`tryDash` 扣减、教学冲刺步骤 enter 时也要同步。
25. **手机视口**：画布与相机尺寸以 `visualViewport` 为准；`#game-canvas` / `#hud` / `#touch-controls` / `#menus` 使用 `--vvw/--vvh`（JS 写入），不要改回 `resizeTo: window` / 100vh。部分手机浏览器地址栏伸缩不派发 `resize`，主循环每帧 `applyViewport()` 兜底。竖屏已支持：`Camera.minZoom/defaultZoom` 有独立分支，回合开始时 `frameTurnCamera()` 尝试同时框住虫虫和最近敌人。

## 发布

```bash
git add -A && git commit -m "..." && git push origin main   # origin 已配为 SSH 443，见下
```

- 仓库：`XeonStin/crateroid`，GitHub Pages（legacy，`main` 根目录）→ https://xeonstin.github.io/crateroid/ ，推送后约 1 分钟生效。
- **网络注意**：本机所在网络对 `github.com` 直连与 HTTPS 推送被拦截，`api.github.com` 可用但大请求体会被截断。当前推送走 **SSH over 443**：`origin = ssh://git@ssh.github.com:443/XeonStin/crateroid.git`，认证使用已添加到仓库的 **Deploy Key**（`~/.ssh/id_rsa`）。普通 `git push` 即可，无需额外参数。若换机器推送，需要新的 deploy key 或可用的代理。
- **vendor 分片**：`vendor/pixi/*.bin`（12 片）+ `vendor/pixi-loader.js` 在运行时拼接并动态 import；不要合并回单个大文件——当前网络对大请求体上传不稳定。`.gitattributes` 已标记 `.bin` 为 binary。
- 线上环境无 `serve.py`：`screenshot()` 的 `POST /__save` 会 404（仅调试用，不影响游戏）。
