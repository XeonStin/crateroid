// ============ 输入：键盘 + 鼠标 + 触摸统一抽象 ============
// 游戏侧设置 mode：'aim'（可瞄准）| 'target'（标记目标点）| 'idle'（观战可平移）
// 回调：onAimMove(wx,wy) 鼠标绝对瞄准 / onChargeStart() onChargeEnd()
//       onStickStart/Move/End 右摇杆蓄力 / onTarget(wx,wy) / onZoom(focusX,focusY,dy,continuous)

export class Input {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.cam = camera;
    this.mode = 'idle';
    this.keys = new Set();
    this.virtual = { left: false, right: false, jump: false, fire: false };
    this.pointers = new Map();      // id -> {x,y}
    this.pinchDist = 0;
    // 回调（由 game/touch 注入）
    this.onAimDrag = null; this.onAimRelease = null; this.onAimCancel = null;
    this.onAimMove = null; this.onChargeStart = null; this.onChargeEnd = null;
    this.onStickStart = null; this.onStickMove = null; this.onStickEnd = null;
    this.onTapAim = null;
    this.onTarget = null; this.onZoom = null; this.onPan = null;
    this.onJumpPress = null;

    this._mouseCharge = false;
    this._tapStart = null;          // 触摸按下起点（判定轻点确认目标）
    this._coarse = (navigator.maxTouchPoints > 0)
      || (window.matchMedia && matchMedia('(pointer: coarse)').matches)
      || ('ontouchstart' in window);

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyW') {
        if (this.onJumpPress && this.mode === 'aim') this.onJumpPress();
        e.preventDefault();
      }
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= 8 && this.onDigit) this.onDigit(n);
      }
      if (e.code === 'Tab' && this.onWeaponMenu) { e.preventDefault(); this.onWeaponMenu(); }
      if (e.code === 'Escape' && this.onCancelKey) this.onCancelKey();
      // 双击方向 = 冲刺
      if (!e.repeat && (e.code === 'KeyA' || e.code === 'ArrowLeft')) this._dirTap(-1);
      if (!e.repeat && (e.code === 'KeyD' || e.code === 'ArrowRight')) this._dirTap(1);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointers.clear();
      this.pinchDist = 0;
      this._pinchMid = null;
      this._panning = null;
      this._mouseCharge = false;
      this._tapStart = null;
      this.virtual.left = false; this.virtual.right = false;
      this.virtual.jump = false; this.virtual.fire = false;
    });

    const opt = { passive: false };
    if (window.PointerEvent) {
      this.canvas.addEventListener('pointerdown', (e) => this._down(e), opt);
      this.canvas.addEventListener('pointermove', (e) => this._move(e), opt);
      this.canvas.addEventListener('pointerup', (e) => this._up(e), opt);
      this.canvas.addEventListener('pointercancel', (e) => this._cancel(), opt);
    } else {
      // 老 WebView（无 Pointer Events）回退：触摸/鼠标事件适配为统一对象
      // 触摸必须遍历 changedTouches：只取 [0] 会让双指缩放/双指同抬失效
      const adaptTouch = (t) => ({
        pointerType: 'touch',
        pointerId: t.identifier ?? 0,
        clientX: t.clientX,
        clientY: t.clientY,
        preventDefault: () => {},
      });
      const adaptMouse = (e) => ({
        pointerType: 'mouse',
        pointerId: 1,
        clientX: e.clientX,
        clientY: e.clientY,
        preventDefault: () => e.preventDefault(),
      });
      const posOf = (t) => ({ x: t.clientX, y: t.clientY });
      this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); for (const t of e.changedTouches) this._down(adaptTouch(t), posOf(t)); }, opt);
      this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) this._move(adaptTouch(t), posOf(t)); }, opt);
      this.canvas.addEventListener('touchend', (e) => { for (const t of e.changedTouches) this._up(adaptTouch(t), posOf(t)); }, opt);
      this.canvas.addEventListener('touchcancel', () => this._cancel(), opt);
      this.canvas.addEventListener('mousedown', (e) => { this._down(adaptMouse(e), posOf(e)); }, opt);
      this.canvas.addEventListener('mousemove', (e) => { this._move(adaptMouse(e), posOf(e)); }, opt);
      this.canvas.addEventListener('mouseup', (e) => { this._up(adaptMouse(e), posOf(e)); }, opt);
    }
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      this.onZoom?.(e.clientX - r.left, e.clientY - r.top, e.deltaY);
    }, opt);
    // 右键取消：注意——左键按住时再按右键，浏览器只会派发 contextmenu/mousedown，
    // 不会派发第二个 pointerdown，所以这里必须用这两个事件兜底
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._cancel();
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        e.preventDefault();
        this._cancel();
      }
    });
  }

  pos(e) {
    // 兼容旧签名：有的浏览器 pointer 事件不带 clientX（极少见）
    if (e.clientX === undefined) return { x: 0, y: 0 };
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // 方向键双击检测 → 冲刺
  _dirTap(dir) {
    const now = performance.now();
    if (dir === this._lastTapDir && now - this._lastTapAt < 300) {
      this.onDashKey?.(dir);
      this._lastTapAt = 0; // 防三连触发
    } else {
      this._lastTapDir = dir;
      this._lastTapAt = now;
    }
  }

  isTouch(e) {
    return e.pointerType === 'touch'
      || (!e.pointerType && this._coarse); // pointerType 缺失时按设备能力判断
  }

  // 指针取消（系统手势/来电等）：终止瞄准但不发射
  _cancel() {
    this._panning = null;
    this._mouseCharge = false;
    this._tapStart = null;
    this.pointers.clear();
    this.pinchDist = 0;
    this._pinchMid = null;
    this.onAimCancel?.();
  }

  _down(e, pArg) {
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 合成事件无活动指针 */ }
    const p = pArg || this.pos(e);
    this.pointers.set(e.pointerId, p);

    // 三指以上：冻结捏合状态并忽略（否则抬回两指时用陈旧间距会猛跳一次缩放）
    if (this.pointers.size > 2) {
      this.pinchDist = 0;
      this._pinchMid = null;
      return;
    }

    // 双指 → 捏合/平移
    if (this.pointers.size === 2) {
      this._panning = null;
      this._tapStart = null;
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this._pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }

    if (this.isTouch(e)) {
      // 触屏单指：一律拖动平移视角（瞄准走右摇杆，标记目标走轻点）
      this._panning = p;
      this._tapStart = { x: p.x, y: p.y, t: performance.now() };
    } else {
      // 鼠标
      if (e.button === 2) {
        // 右键取消瞄准/蓄力（不发射）
        this._cancel();
        return;
      }
      // 中键拖动（或 Shift + 左键）平移视角
      if (e.button === 1 || (e.button === 0 && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')))) {
        this._panning = p;
        return;
      }
      if (this.mode === 'target') {
        const w = this.cam.screenToWorld(p.x, p.y);
        this.onTarget?.(w.x, w.y);
        return;
      }
      const w = this.cam.screenToWorld(p.x, p.y);
      this.onAimMove?.(w.x, w.y);
      if (this.mode === 'aim') {
        this._mouseCharge = true;
        this.onChargeStart?.(w.x, w.y);
      } else {
        this._panning = p;
      }
    }
  }

  _move(e, pArg) {
    const p = pArg || this.pos(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);

    // 双指：中点拖动 = 平移，间距变化 = 缩放（张开放大 / 捏合缩小，连续平滑）
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (this.pinchDist > 0) {
        const last = this._pinchMid;
        if (last) {
          const dx = mx - last.x, dy = my - last.y;
          if (Math.abs(dx) + Math.abs(dy) > 0.5) this.onPan?.(dx, dy);
        }
        if (Math.abs(d - this.pinchDist) > 0.5) {
          // 传原始像素增量 + continuous 标记，游戏侧用平滑指数映射（约 320px 捏合 = 2.7 倍）
          this.onZoom?.(mx, my, d - this.pinchDist, true);
        }
      }
      this.pinchDist = d;
      this._pinchMid = { x: mx, y: my };
      return;
    }

    if (this.isTouch(e)) {
      if (this._panning) {
        this.onPan?.(p.x - this._panning.x, p.y - this._panning.y);
        this._panning = p;
      }
    } else {
      if (this._panning) {
        this.onPan?.(p.x - this._panning.x, p.y - this._panning.y);
        this._panning = p;
      } else if (this._mouseCharge) {
        const w = this.cam.screenToWorld(p.x, p.y);
        this.onAimMove?.(w.x, w.y);
      } else if (this.mode === 'aim' || this.mode === 'target') {
        const w = this.cam.screenToWorld(p.x, p.y);
        this.onAimMove?.(w.x, w.y);
      }
    }
  }

  _up(e, pArg) {
    const p = pArg || this.pos(e);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.pinchDist = 0;
      this._pinchMid = null;
    }

    if (this.isTouch(e)) {
      // 轻点（几乎没拖动）：标记模式确认落点；瞄准模式选中目标类武器（空袭/奶牛）
      if (this._tapStart) {
        const moved = Math.hypot(p.x - this._tapStart.x, p.y - this._tapStart.y);
        if (moved < 12 && performance.now() - this._tapStart.t < 600) {
          const w = this.cam.screenToWorld(p.x, p.y);
          if (this.mode === 'target') this.onTarget?.(w.x, w.y);
          else if (this.mode === 'aim') this.onTapAim?.(w.x, w.y);
        }
      }
      this._tapStart = null;
      this._panning = null;
    } else {
      if (this._mouseCharge) {
        this._mouseCharge = false;
        this.onChargeEnd?.();
      }
      this._panning = null;
    }
  }

  // ---------- 动作查询 ----------
  moveDir() {
    let d = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.virtual.left) d -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.virtual.right) d += 1;
    return d;
  }

  // 跳跃键 = 跳跃 /（有喷气背包时）推进
  jumpHeld() { return this.keys.has('KeyW') || this.keys.has('Space') || this.virtual.jump; }

  // 触控开火键（charge 模式）
  fireHeld() { return this.virtual.fire; }
}
