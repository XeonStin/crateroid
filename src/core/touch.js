// ============ 触控虚拟按键层（仅触屏设备显示） ============
// 底部一排：左下 移动摇杆（左右行走）  右下 蓄力摇杆（方向=发射方向，行程=力度，松手发射）
// 蓄力摇杆左侧一列两键：⤒ 跳跃/喷气（上）+ 💨 冲刺（下）
// 「取消蓄力」按钮（蓄力摇杆上方）：蓄力摇杆拖到按钮上（或直接点按）即取消，不发射；⏭ 跳过在右上角
export class TouchControls {
  constructor(input, opts = {}) {
    this.input = input;
    this.onWeaponPanel = opts.onWeaponPanel || (() => {});
    this.onSkip = opts.onSkip || (() => {});
    this.onDash = opts.onDash || (() => {});
    this.root = document.getElementById('touch-controls');
    if (!this.root) return;
    if (!TouchControls.isTouchDevice) {
      // 桌面环境隐藏虚拟按键
      this.root.style.display = 'none';
      return;
    }
    this.build();
  }

  static get isTouchDevice() {
    // ?touch=1 强制触屏（调试/自动化），?touch=0 强制桌面
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('touch')) return q.get('touch') !== '0';
    } catch { /* ignore */ }
    return (navigator.maxTouchPoints > 0)
      || (window.matchMedia && matchMedia('(pointer: coarse)').matches)
      || ('ontouchstart' in window);
  }

  // 统一按下/抬起绑定：优先 Pointer Events，老 WebView 回退触摸/鼠标
  // onCancel：系统手势打断（pointercancel/touchcancel）时的清理——不触发 onUp 的动作语义
  _bindPress(el, onDown, onUp, onCancel) {
    const canceled = () => { (onCancel || (() => {}))(); };
    if (window.PointerEvent) {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* */ } onDown(e); });
      el.addEventListener('pointerup', (e) => { e.preventDefault(); onUp(e); });
      el.addEventListener('pointercancel', canceled);
    } else {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); onUp(e); }, { passive: false });
      el.addEventListener('touchcancel', canceled);
      el.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(e); });
      el.addEventListener('mouseup', (e) => { e.preventDefault(); onUp(e); });
    }
  }

  build() {
    const mkBtn = (cls, label, id) => {
      const b = document.createElement('button');
      b.className = 'tbtn ' + cls;
      b.id = id;
      b.innerHTML = label;
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      this.root.appendChild(b);
      return b;
    };
    const mkJoy = (id, cls) => {
      const base = document.createElement('div');
      base.className = 'joy ' + cls;
      base.id = id;
      base.innerHTML = '<div class="joy-knob"></div>';
      base.addEventListener('contextmenu', (e) => e.preventDefault());
      this.root.appendChild(base);
      return base;
    };

    this.joyMove = mkJoy('joy-move', '');
    this.joyAim = mkJoy('joy-aim', 'aim');
    const btnJump = mkBtn('tj', '⤒', 'tb-jump');
    const btnDash = mkBtn('td', '💨', 'tb-dash');
    const btnSkip = mkBtn('ts', '⏭', 'tb-skip');
    const btnCancel = mkBtn('tcancel', '✖ 取消蓄力', 'tb-cancel');

    // 跳跃：按下沿触发跳跃，按住供喷气推进读取
    this._bindPress(btnJump,
      () => { this.input.virtual.jump = true; this.input.onJumpPress?.(); btnJump.classList.add('active'); },
      () => { this.input.virtual.jump = false; btnJump.classList.remove('active'); },
      () => { this.input.virtual.jump = false; btnJump.classList.remove('active'); });

    // 冲刺：点按沿当前移动方向（没在走则沿面向）冲刺
    this._bindPress(btnDash, () => {}, () => this.onDash());

    this._bindPress(btnSkip, () => {}, () => this.onSkip());

    // 取消蓄力：蓄力中把摇杆拖到按钮上，或直接点按
    this._bindPress(btnCancel, () => {}, () => this.input.onAimCancel?.());

    this.btnJump = btnJump;
    this.btnCancel = btnCancel;

    // ---- 左摇杆：行走（x 轴） ----
    this._bindJoystick(this.joyMove, {
      dead: 0.3,
      onMove: (dx, dy, r) => {
        this.input.virtual.left = dx < -r * 0.3;
        this.input.virtual.right = dx > r * 0.3;
      },
      onEnd: () => { this.input.virtual.left = false; this.input.virtual.right = false; },
    });

    // ---- 右摇杆：蓄力瞄准。方向 = 发射方向，行程 = 力度，松手发射 ----
    // 低力度也能发射（越过起始死区后行程连续映射到力度）；取消只走「取消蓄力」按钮
    this._bindJoystick(this.joyAim, {
      dead: 0.1,
      cancellable: true,
      onEngage: () => { this.input.onStickStart?.(); },
      onMove: (dx, dy, r) => {
        const len = Math.hypot(dx, dy);
        const angle = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
        this.input.onStickMove?.(angle, Math.min(1, len / r));
      },
      onEnd: (dx, dy, r) => {
        const len = Math.hypot(dx, dy);
        const angle = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
        this.input.onStickEnd?.(angle, Math.min(1, len / r));
      },
    });
  }

  // 通用摇杆绑定：基座中心为原点，摇杆头跟随手指（钳制在基座内），
  // 越过死区触发 onEngage，之后持续 onMove(dx,dy,r)，抬手 onEnd(dx,dy,r)
  _bindJoystick(base, h) {
    const knob = base.querySelector('.joy-knob');
    let pid = null, engaged = false, canceled = false;
    // down 时缓存 rect：蓄力期间摇杆/取消按钮不动，免得每个 pointermove 各读一次
    // getBoundingClientRect（60~120Hz 的无谓强制布局）
    let baseRect = null, btnRect = null;
    const setKnob = (x, y) => { knob.style.transform = `translate(${x}px, ${y}px)`; };
    const reset = () => {
      pid = null; engaged = false; canceled = false;
      setKnob(0, 0);
      base.classList.remove('active');
      this.setCancelArmed(false);
    };
    const local = (e) => {
      const r = baseRect || (baseRect = base.getBoundingClientRect());
      return {
        dx: e.clientX - (r.left + r.width / 2),
        dy: e.clientY - (r.top + r.height / 2),
        r: r.width / 2,
      };
    };
    const rectOf = (el, pad) => {
      const b = (el === this.btnCancel && btnRect) ? btnRect : el.getBoundingClientRect();
      return { l: b.left - pad, t: b.top - pad, r: b.right + pad, b: b.bottom + pad };
    };
    base.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      e.preventDefault();
      try { base.setPointerCapture(e.pointerId); } catch { /* */ }
      pid = e.pointerId;
      canceled = false;
      baseRect = base.getBoundingClientRect();
      btnRect = this.btnCancel ? this.btnCancel.getBoundingClientRect() : null;
      base.classList.add('active');
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      e.preventDefault();
      const { dx, dy, r } = local(e);
      const len = Math.hypot(dx, dy);
      const max = r - 8;
      const k = len > max ? max / len : 1;
      setKnob(dx * k, dy * k);
      // 取消蓄力：手指碰到右上角按钮（摇杆头已捕获指针，按屏幕坐标判定）
      if (h.cancellable && !canceled && this.btnCancel && this._inRect(e, rectOf(this.btnCancel, 18))) {
        canceled = true;
        this.btnCancel.classList.add('hit');
        reset();
        this.input.onAimCancel?.();
        setTimeout(() => this.btnCancel?.classList.remove('hit'), 300);
        return;
      }
      if (!engaged && len > r * (h.dead ?? 0.25)) {
        engaged = true;
        h.onEngage?.(dx / (len || 1), dy / (len || 1));
      }
      if (engaged) h.onMove?.(dx, dy, r);
    });
    const up = (e) => {
      if (e.pointerId !== pid) return; // 取消后 pid 已置 null：抬手在这里被拦下，绝不触发 onEnd
      const { dx, dy, r } = local(e);
      reset();
      h.onEnd?.(dx, dy, r);
    };
    // 系统手势/来电打断（pointercancel）：终止但绝不能触发 onEnd——
    // 蓄力摇杆的 onEnd 是发射，被打断就开火等于白白烧掉一个回合
    const cancel = (e) => {
      if (e.pointerId !== pid) return;
      reset();
      if (h.cancellable) this.input.onAimCancel?.(); // 蓄力摇杆：走取消流程（清 charging/力度条）
      else h.onEnd?.(0, 0, 0);                       // 移动摇杆：仅清虚拟方向键
    };
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', cancel);
    this._joyResets = this._joyResets || [];
    this._joyResets.push(reset);
  }

  _inRect(e, r) {
    return e.clientX >= r.l && e.clientX <= r.r && e.clientY >= r.t && e.clientY <= r.b;
  }

  // 取消蓄力按钮的「可投放」高亮（由 game 在真正开始蓄力时点亮）
  setCancelArmed(on) {
    if (this.btnCancel) this.btnCancel.classList.toggle('armed', !!on);
  }

  // 回合切换/锁输入时复位摇杆视觉与虚拟键状态（幂等，可随便调）
  resetStick() {
    for (const fn of this._joyResets || []) fn();
    this.input.virtual.left = false;
    this.input.virtual.right = false;
  }

  setJetMode(on) {
    if (this.btnJump) this.btnJump.innerHTML = on ? '🔥' : '⤒';
  }

  setControlsEnabled(on) {
    if (!on) this.resetStick();
    this.root.classList.toggle('disabled', !on);
  }
}
