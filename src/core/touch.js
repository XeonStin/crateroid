// ============ 触控虚拟按键层（仅触屏设备显示） ============
// 左下：◀ ▶ 行走 + ⤒ 跳跃/喷气推进   右下：🎯开火(蓄力模式) / 💣武器 / ⏭跳过
export class TouchControls {
  constructor(input, opts = {}) {
    this.input = input;
    this.onWeaponPanel = opts.onWeaponPanel || (() => {});
    this.onSkip = opts.onSkip || (() => {});
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
  _bindPress(el, onDown, onUp) {
    if (window.PointerEvent) {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* */ } onDown(e); });
      el.addEventListener('pointerup', (e) => { e.preventDefault(); onUp(e); });
      el.addEventListener('pointercancel', (e) => { onUp(e); });
    } else {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); onUp(e); }, { passive: false });
      el.addEventListener('touchcancel', (e) => { onUp(e); });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(e); });
      el.addEventListener('mouseup', (e) => { e.preventDefault(); onUp(e); });
    }
  }

  build() {
    const mk = (cls, label, id) => {
      const b = document.createElement('button');
      b.className = 'tbtn ' + cls;
      b.id = id;
      b.innerHTML = label;
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      this.root.appendChild(b);
      return b;
    };

    const btnLeft = mk('bl', '◀', 'tb-left');
    const btnRight = mk('bl', '▶', 'tb-right');
    const btnJump = mk('bj', '⤒', 'tb-jump');
    const btnFire = mk('br fire', '🔥', 'tb-fire');
    const btnWeapon = mk('br', '🎒', 'tb-weapon');
    const btnSkip = mk('br small', '⏭', 'tb-skip');

    // 行走（按住），双击 = 冲刺
    const hold = (btn, prop, dir) => {
      let lastAt = 0;
      this._bindPress(btn,
        () => {
          const now = performance.now();
          if (now - lastAt < 300) this.input.onDashKey?.(dir);
          lastAt = now;
          this.input.virtual[prop] = true; btn.classList.add('active');
        },
        () => { this.input.virtual[prop] = false; btn.classList.remove('active'); });
    };
    hold(btnLeft, 'left', -1); hold(btnRight, 'right', 1);

    // 跳跃：按下沿触发跳跃，按住供喷气推进读取
    this._bindPress(btnJump,
      () => { this.input.virtual.jump = true; this.input.onJumpPress?.(); btnJump.classList.add('active'); },
      () => { this.input.virtual.jump = false; btnJump.classList.remove('active'); });

    // 开火键（charge 模式）：按住蓄力松开发射
    this._bindPress(btnFire,
      () => { this.input.virtual.fire = true; this.input.onChargeStart?.(); btnFire.classList.add('active'); },
      () => { this.input.virtual.fire = false; this.input.onChargeEnd?.(); btnFire.classList.remove('active'); });

    this._bindPress(btnWeapon, () => {}, () => this.onWeaponPanel());
    this._bindPress(btnSkip, () => {}, () => this.onSkip());

    this.btnJump = btnJump;
    this.btnFire = btnFire;
  }

  setFireMode(mode) {
    // slingshot 模式开火键隐藏（松手即发射），charge 模式显示
    if (this.btnFire) this.btnFire.style.display = mode === 'charge' ? '' : 'none';
  }

  setJetMode(on) {
    if (this.btnJump) this.btnJump.innerHTML = on ? '🔥' : '⤒';
  }

  setControlsEnabled(on) {
    this.root.classList.toggle('disabled', !on);
  }
}
