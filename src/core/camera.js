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
    const fit = Math.max(this.viewW / this.worldW, this.viewH / this.worldH);
    if (this.viewH > this.viewW) {
      // 竖屏：允许缩小到能看见更宽的战场（纵向多出的区域由天空/水面填充）
      return Math.max(0.45, this.viewW / this.worldW);
    }
    return fit;
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
    const k = 1 - Math.pow(0.0015, dt); // 平滑系数
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.zoom += (this.tzoom - this.zoom) * k;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shakeAmp = 0;
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
  _bounds() {
    const halfW = this.viewW / (2 * this.zoom), halfH = this.viewH / (2 * this.zoom);
    const minX = halfW, maxX = this.worldW - halfW;
    const minY = halfH - 220, maxY = this.worldH - halfH;
    return {
      minX: maxX < minX ? this.worldW / 2 : minX,
      maxX: maxX < minX ? this.worldW / 2 : maxX,
      minY: maxY < minY ? this.worldH / 2 : minY,
      maxY: maxY < minY ? this.worldH / 2 : maxY,
    };
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
    container.scale.set(this.zoom);
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
