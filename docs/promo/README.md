# 宣传图 / Promo sheet

| 文件 | 说明 |
| --- | --- |
| `poster.html` | 源文件（1240×1754，A3 竖版比例，纯 HTML/CSS，无外部依赖） |
| `poster.png` | 1240×1754 位图，直接贴群里/README 用 |
| `poster.pdf` | 打印用单页 PDF |
| `assets/deepseek-whalegirl.png` | 图上角色（见下方授权） |

重新渲染（Windows，装有 Edge）：

```powershell
msedge --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files `
  --virtual-time-budget=9000 --window-size=1240,1754 --screenshot=poster.png poster.html
msedge --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files `
  --no-pdf-header-footer --virtual-time-budget=9000 --print-to-pdf=poster.pdf poster.html
```

## 角色授权（与代码分开）

海报上的鲸鱼娘来自社区流传的同人图，来源仓库
[`fornarwhal/deepseek-whale-girl-icon`](https://github.com/fornarwhal/deepseek-whale-girl-icon)：

- 角色形象来源：上善无形（原创 OC「溟月」）
- DeepSeek 元素二创：ZipZipPipe
- 去伪影修复：QYQCAMIAO
- 授权协议：**CC BY-NC-SA 4.0**（署名、非商用、相同方式共享）

因此本目录下的 `poster.*` 与 `assets/` 按 **CC BY-NC-SA 4.0** 授权，
仅用于项目介绍，不含任何商业用途；仓库其余代码仍为 MIT。
若要商用或再分发，请自行替换该角色图（`poster.html` 里只有一处 `<img class="portrait">`）。
