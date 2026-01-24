# PasswordMan

<div align="center">

🔐 一个简洁、安全、便携的本地密码管理器

[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

## ✨ 特性

- 🔒 **本地存储**：所有密码数据存储在本地 SQLite 数据库，无需联网，保护隐私安全
- 💼 **绿色便携**：数据库文件与程序位于同一目录，复制即可迁移，适合 U 盘携带
- 🎯 **简洁易用**：清爽的界面设计，操作直观，无学习成本
- 🔍 **快速搜索**：支持按名称、用户名、备注多字段模糊搜索
- 🎲 **密码生成**：内置强密码生成器，一键生成安全密码
- 👁️ **显示隐藏**：密码默认隐藏，点击眼睛图标可查看
- 📋 **快速复制**：一键复制密码到剪贴板
- 🌓 **主题切换**：支持亮色/暗色主题，跟随系统或手动切换
- 🖥️ **系统托盘**：最小化到托盘，后台静默运行
- 📦 **体积小巧**：基于 Tauri，安装包仅 8-10MB
- 🚀 **性能优秀**：Rust + Web 技术栈，启动快速，内存占用低

## 📸 截图

> TODO: 添加应用截图

## 🚀 快速开始

### 方式一：下载绿色版（推荐）

1. 从 [Releases](../../releases) 下载最新的 `PasswordMan-Portable.zip`
2. 解压到任意目录（建议非系统目录，确保有写入权限）
3. 双击 `password-man.exe` 即可运行
4. 数据库文件 `pwd.db` 会自动创建在 exe 同级目录

### 方式二：下载安装版

1. 从 [Releases](../../releases) 下载安装包
   - MSI 安装包：`PasswordMan_x.x.x_x64_en-US.msi`
   - NSIS 安装包：`PasswordMan_x.x.x_x64-setup.exe`
2. 运行安装程序，按提示完成安装
3. 数据库文件会创建在程序安装目录

### 系统要求

- **操作系统**：Windows 10/11
- **依赖**：WebView2 运行时
  - Windows 11 自带
  - Windows 10 需单独安装：[下载 WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)

## 📖 使用说明

### 添加密码

1. 点击右上角的 `+` 按钮
2. 填写密码名称（必填）、用户名、密码（必填）、备注
3. 可点击密码框旁的 🎲 按钮生成随机强密码
4. 点击保存

### 查看和管理密码

- **搜索**：在顶部搜索框输入关键词，实时过滤结果
- **查看密码**：点击 👁️ 图标显示/隐藏密码
- **复制密码**：点击 📋 图标快速复制到剪贴板
- **修改**：点击"修改"按钮编辑密码信息
- **删除**：点击"删除"按钮移除密码（需确认）

### 系统托盘

- 点击窗口关闭按钮，程序最小化到系统托盘
- 左键点击托盘图标或右键选择"打开主界面"可恢复窗口
- 右键选择"退出"可完全关闭程序

### 数据备份

数据库文件 `pwd.db` 包含所有密码数据，定期复制此文件即可备份。建议：

- 定期备份到云盘或其他安全位置
- 可使用加密工具对备份文件进行加密保护

## 🛠️ 开发

### 环境准备

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) 1.70+
- [pnpm](https://pnpm.io/)

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm tauri dev
```

### 构建生产版本

```bash
# 构建安装包
pnpm tauri build

# 复制绿色版
pnpm portable
```

### 项目结构

```
PasswordMan/
├── src/                    # 前端代码
│   ├── index.html         # 主页面
│   ├── main.js            # 主逻辑
│   └── styles.css         # 样式
├── src-tauri/             # Rust 后端
│   ├── src/
│   │   ├── main.rs        # 入口
│   │   ├── lib.rs         # 应用主逻辑
│   │   └── db.rs          # 数据库操作
│   ├── Cargo.toml         # Rust 依赖
│   └── tauri.conf.json    # Tauri 配置
└── package.json           # Node 依赖
```

## 🔐 安全说明

- ⚠️ **数据库未加密**：目前 `pwd.db` 文件为明文存储，请妥善保管
- 💡 **建议**：
  - 不要在共享电脑上使用
  - 定期备份数据
  - 使用磁盘加密（如 BitLocker）保护数据安全
  - 未来版本计划加入数据库加密功能

## 🗺️ 路线图

- [ ] 数据库加密
- [ ] 主密码保护
- [ ] 密码强度检测
- [ ] 分类/标签功能
- [ ] 导入导出功能（CSV, JSON）
- [ ] 自动填充（浏览器扩展）
- [ ] 跨平台支持（macOS, Linux）
- [ ] 自动备份功能
- [ ] 密码过期提醒
- [ ] 双因素认证支持

## 📝 技术栈

- **前端**：HTML5 + CSS3 + JavaScript (Vanilla)
- **后端**：Rust
- **框架**：[Tauri](https://tauri.app/) 2.0
- **数据库**：SQLite 3 (通过 rusqlite)
- **构建工具**：Cargo + pnpm

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

## ⚠️ 免责声明

本软件仅供个人学习和使用。请妥善保管您的密码数据，作者不对任何数据丢失或安全问题负责。
