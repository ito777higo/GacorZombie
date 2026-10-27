# spine-ts 3.6（官方网页运行库，未修改）

- 文件：`spine-webgl.js`（全局变量 `spine`，经典脚本，不是 ES module）
- 来源：https://github.com/EsotericSoftware/spine-runtimes/blob/654c20e5b0e523040b6366bbd1042510d2645134/spine-ts/build/spine-webgl.js
- 分支 3.6，提交 `654c20e5b0e523040b6366bbd1042510d2645134`，取于 2026-10-24
- 版本必须和素材一致：美术导出的是 Spine 3.6.53，所以用 3.6 运行库。换成 3.7 以上会读不了。
- 授权见 `LICENSE`（Spine Runtimes License v2.5）：正式上线需要公司持有 Spine 编辑器授权。授权要求不改动运行库本身，所以游戏代码只在 `src/spine/` 里包一层，不改这个文件。
