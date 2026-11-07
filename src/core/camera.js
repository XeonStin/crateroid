// ============ 摄像机：跟随 / 缩放 / 震动 ============
import { WORLD_W, WORLD_H } from '../config.js';

export class Camera {
  constructor() {
    this.x = WORLD_W / 2; this.y = WORLD_H / 2;
    this.worldW = WORLD_W; this.worldH = WORLD_H;
    this.zoom = 0.7;
    this.tx = this.x; this.ty = this.y; this.tzoom = this.zoom;
    this.viewW = 1280; this.viewH = 720;
    this.shakeAmp = 0; this.shakeT = 0;
    this._punchT = 0; this._punchAmp = 0;
    this._cinema = false;
    this.enabled = true;
  }

  resize(w, h) { this.viewW = w; this.viewH = h; this._clampZoom(); }

  // 普通对战可选大/中/小地图：相机边界必须跟随当前地形尺寸
  setWorldSize(w, h) {
    this.worldW = w; this.worldH = h;
    this._clampZoom();
  }

  shake(amp) {
    if (!this.enabled) return;
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = 0.45;
  }

  // 终局运镜模式：缩放的平滑系数放缓（推拉镜头缓入缓出）；
  // 位置保持标准缓动——太软会让巡航跟弹末端跟不上弹丸
  setCinema(on) { this._cinema = !!on; }

  // 爆炸 punch-in：纯渲染偏移（applyTo 乘算），绝不碰 tzoom——避免污染用户缩放
  punch(amp) {
    if (!this.enabled) return;
    const cur = this._punchT > 0 ? this._punchAmp * (this._punchT / 0.22) : 0;
    if (amp > cur) { this._punchAmp = amp; this._punchT = 0.22; }
  }

  setZoom(z, focusX, focusY) {
    const minZ = this.minZoom();
    this.tzoom = Math.min(3, Math.max(minZ, z));
    if (focusX !== undefined) {
      // 围绕焦点缩放：保持焦点屏幕位置不动
      const k = this.tzoom / this.zoom;
      this.tx = focusX - (focusX - this.tx) / k;
      this.ty = focusY - (focusY - this.ty) / k;
    }
  }

  minZoom() {
    // 最小倍率 = 完整看到整个战场（横竖屏一致，全图召唤空袭需要）
    // 取两个方向的较小比值：短边方向正好放下全图，长边方向多出的区域由天空/水面填充
    return Math.max(0.08, Math.min(this.viewW / this.worldW, this.viewH / this.worldH));
  }

  // 默认缩放：竖屏适度拉远，保证角色/地形不会占满整屏
  defaultZoom() {
    if (this.viewH > this.viewW) {
      return Math.min(1.05, Math.max(this.minZoom(), 0.62));
    }
    return Math.max(this.minZoom(), Math.min(1.05, this.viewW / 1500));
  }

  follow(x, y, snap = false) {
    this.tx = x; this.ty = y;
    if (snap) { this.x = x; this.y = y; }
  }

  pan(dx, dy) {
    this.tx -= dx / this.zoom;
    this.ty -= dy / this.zoom;
    this._clampTarget();
  }

  update(dt) {
    // 平滑系数：位置用标准缓动（跟弹要紧）；缩放在 cinema 模式放缓 → 推拉缓起缓收
    const k = 1 - Math.pow(0.0015, dt);
    const zk = 1 - Math.pow(this._cinema ? 0.05 : 0.0015, dt);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.zoom += (this.tzoom - this.zoom) * zk;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    if (this._punchT > 0) {
      this._punchT -= dt;
      if (this._punchT <= 0) { this._punchT = 0; this._punchAmp = 0; }
    }
    // 目标与实际位置都要钳制：follow() 每帧把目标设为弹丸坐标（可为世界外），
    // 若不夹住实际位置，弹丸打上天时镜头会飞出世界变成全空画面
    const b = this._bounds();
    this.tx = Math.min(b.maxX, Math.max(b.minX, this.tx));
    this.ty = Math.min(b.maxY, Math.max(b.minY, this.ty));
    this.x = Math.min(b.maxX, Math.max(b.minX, this.x));
    this.y = Math.min(b.maxY, Math.max(b.minY, this.y));
  }

  _clampZoom() { this.tzoom = Math.min(3, Math.max(this.minZoom(), this.tzoom)); }

  // 视野边界：左右/下方严格不出世界；顶部允许 220px 天空余量（追踪高抛弹道）
  // 返回复用对象（update/_clampX/_clampY 每帧多次调用，避免每次分配）
  _bounds() {
    const b = this._b || (this._b = { minX: 0, maxX: 0, minY: 0, maxY: 0 });
    const halfW = this.viewW / (2 * this.zoom), halfH = this.viewH / (2 * this.zoom);
    const minX = halfW, maxX = this.worldW - halfW;
    let minY = halfH - 220, maxY = this.worldH - halfH;
    // 整个世界高度已能放进视野时垂直居中：否则天空余量会把画面顶高、切掉底部水域
    // （-0.5 容差：恰好整屏放下时 halfH 浮点上会略小于 worldH/2）
    if (halfH >= this.worldH / 2 - 0.5) { minY = this.worldH / 2; maxY = this.worldH / 2; }
    b.minX = maxX < minX ? this.worldW / 2 : minX;
    b.maxX = maxX < minX ? this.worldW / 2 : maxX;
    b.minY = maxY < minY ? this.worldH / 2 : minY;
    b.maxY = maxY < minY ? this.worldH / 2 : maxY;
    return b;
  }

  _clampX(v) {
    const b = this._bounds();
    return Math.min(b.maxX, Math.max(b.minX, v));
  }

  _clampY(v) {
    const b = this._bounds();
    return Math.min(b.maxY, Math.max(b.minY, v));
  }

  _clampTarget() {
    this.tx = this._clampX(this.tx);
    this.ty = this._clampY(this.ty);
  }

  // 应用到容器
  applyTo(container) {
    let sx = 0, sy = 0;
    if (this.enabled && this.shakeAmp > 0 && this.shakeT > 0) {
      const k = this.shakeAmp * (this.shakeT / 0.45);
      sx = (Math.random() * 2 - 1) * k;
      sy = (Math.random() * 2 - 1) * k;
    }
    container.position.set(this.viewW / 2 + sx, this.viewH / 2 + sy);
    const pz = this._punchT > 0 ? 1 + this._punchAmp * Math.pow(this._punchT / 0.22, 2) : 1;
    container.scale.set(this.zoom * pz);
    container.pivot.set(this.x, this.y);
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }
}
