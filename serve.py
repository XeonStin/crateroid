#!/usr/bin/env python3
"""弹坑星球 CRATEROID — 静态服务器
用法: python serve.py [端口]   (默认 5610)
绑定 0.0.0.0，手机连同一局域网可直接访问（启动时打印本机 IP）。
附加: POST /__save?name=x.png  把 PNG 字节写入 testshots/(自动化截图落盘)
      GET  /healthz           探活
"""
import http.server
import json
import os
import re
import socket
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5610
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)


def lan_ips():
    ips = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith('127.'):
                ips.add(ip)
    except OSError:
        pass
    # 兜底：探测默认路由出口
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(ips)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
    }
    # Python 3.9+ 的 SimpleHTTPRequestHandler 用 guess_type 覆盖
    def guess_type(self, path):
        if path.endswith('.mjs'):
            return 'text/javascript; charset=utf-8'
        return super().guess_type(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 安静模式

    # ---- 自动化截图落盘 ----
    def do_POST(self):
        if not self.path.startswith('/__save'):
            self.send_error(404)
            return
        name = 'shot.png'
        m = re.search(r'name=([^&]+)', self.path)
        if m:
            from urllib.parse import unquote
            name = unquote(m.group(1))
        name = re.sub(r'[^\w.\-]', '_', name)
        if not name.lower().endswith('.png'):
            name += '.png'
        length = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(length)
        outdir = os.path.join(ROOT, 'testshots')
        os.makedirs(outdir, exist_ok=True)
        path = os.path.join(outdir, name)
        with open(path, 'wb') as f:
            f.write(data)
        body = json.dumps({'ok': True, 'path': f'testshots/{name}', 'bytes': len(data)}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/healthz'):
            body = json.dumps({'ok': True, 'app': 'crateroid'}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server(('0.0.0.0', PORT), Handler) as httpd:
        print('弹坑星球 CRATEROID — 回合制炮术虫虫对战')
        print(f'本机:   http://127.0.0.1:{PORT}/')
        for ip in lan_ips():
            print(f'局域网: http://{ip}:{PORT}/   (手机连同一 Wi-Fi 可直接玩)')
        print('(Ctrl+C 停止)')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n已停止')
