// vendor/pixi-loader.js
// PixiJS v8 以 12 个分片存于 ./pixi/*.bin，此处并行拉取、拼接为 Blob 模块后动态 import。
// 分片原因：部分网络环境对 >100KB 的请求体上传限速/超时，大文件拆小才能可靠分发。
// 对外只暴露游戏实际用到的 7 个导出（见 src 内 `import * as PIXI from 'pixi.js'`）。
const PART_COUNT = 12;
const base = new URL('./pixi/', import.meta.url);

const chunks = await Promise.all(
  Array.from({ length: PART_COUNT }, async (_, i) => {
    const name = String(i + 1).padStart(2, '0') + '.bin';
    const res = await fetch(new URL(name, base));
    if (!res.ok) throw new Error(`Pixi 分片加载失败: ${name} (HTTP ${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  })
);

let total = 0;
for (const c of chunks) total += c.length;
const bytes = new Uint8Array(total);
let off = 0;
for (const c of chunks) { bytes.set(c, off); off += c.length; }

const url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
const mod = await import(url);

export const Application = mod.Application;
export const Container = mod.Container;
export const Graphics = mod.Graphics;
export const Sprite = mod.Sprite;
export const Texture = mod.Texture;
export const Text = mod.Text;
export const Color = mod.Color;
