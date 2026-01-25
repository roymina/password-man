# PasswordMan

<div align="center">

🔐 A simple, secure, and portable local password manager

[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[English](./README.md) | [中文说明](./README_CN.md)

</div>

## ✨ Features

- 🔒 **Local Storage**: All data is stored in a local SQLite database, offline-first for privacy.
- �️ **Secure Encryption**: **Supports SQLCipher database encryption**. Set a master password to encrypt your database file and prevent unauthorized access.
- �💼 **Portable**: Database lives alongside the executable. Simply copy the folder to a USB drive to take it anywhere.
- 🎯 **Simple & Intuitive**: Clean, user-friendly interface with zero learning curve.
- � **Pin to Top**: Pin important passwords to the top of the list for quick access.
- �🔍 **Fast Search**: Real-time fuzzy search by name, username, or notes.
- 🎲 **Password Generator**: Built-in strong password generator.
- 👁️ **Toggle Visibility**: Passwords are hidden by default; click the eye icon to reveal.
- 📋 **Quick Copy**: One-click copy to clipboard with toast notifications.
- 🌓 **Theme Support**: Light/Dark mode support (follows system or manual toggle).
- 🖥️ **System Tray**: Minimize to tray for silent background operation.
- 📦 **Compact**: Built on Tauri, installer size is only ~8-10MB.
- 🚀 **High Performance**: Rust + Web Tech stack, fast startup, low memory usage.

## 🚀 Quick Start

### Method 1: Portable Version (Recommended)

1. Download the latest `PasswordMan-Portable.zip` from [Releases](../../releases).
2. Unzip to any directory (preferably non-system folders to ensure write permissions).
3. Run `password-man.exe`.
4. The database file `pwd.db` will be automatically created in the same directory.

### Method 2: Installer

1. Download the installer from [Releases](../../releases).
   - MSI: `PasswordMan_x.x.x_x64_en-US.msi`
   - NSIS: `PasswordMan_x.x.x_x64-setup.exe`
2. Run the installer and follow the prompts.
3. The database file will be created in the installation directory.

### System Requirements

- **OS**: Windows 10/11
- **Dependency**: WebView2 Runtime
  - Included in Windows 11
  - Windows 10: [Download WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)

## 📖 Usage

### Adding Passwords

1. Click the `+` button in the top right.
2. Fill in Name (Required), Username, Password (Required), and Notes.
3. Use the 🎲 button to generate a strong random password.
4. Click Save.

### Managing Passwords

- **Pinning**: Click the 📌 icon to pin/unpin important items.
- **Search**: Type keywords in the top search bar to filter instantly.
- **Reveal**: Click the 👁️ icon to show/hide the password.
- **Copy**: Click the 📋 icon to copy password to clipboard.
- **Edit**: Click the ✏️ (Edit) button to modify details.
- **Delete**: Click the 🗑️ (Delete) button to remove an entry.

### System Settings & Security

Click the 🛠️ Settings button in the top right:

- **Enable Password Protection**: Set a master password to encrypt the database.
- **Change Master Password**: Update your existing master password.
- **Remove Password Protection**: Decrypt the database and remove the master password.
- **Unlock Database**: If password protection is enabled, you must enter the master password at startup.

### System Tray

- Clicking the close button minimizes the app to the system tray.
- Left-click (or Right-click -> Open) the tray icon to restore the window.
- Right-click -> "Quit" to exit the application completely.

### Backup

The `pwd.db` file contains all your data. Simply copy this file to backup.
**Note**: If you have enabled password protection, `pwd.db` is encrypted. You MUST remember your master password to decrypt your backup.

## 🛠️ Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) 1.70+
- [pnpm](https://pnpm.io/)
- [Strawberry Perl](https://strawberryperl.com/) (Required for compiling OpenSSL on Windows)

### Install Dependencies

```bash
pnpm install
```

### Dev Mode

```bash
pnpm tauri dev
```

### Build

```bash
# Build Installer
pnpm tauri build

# Create Portable Version
pnpm portable
```

## 🔐 Security

- ✅ **Database Encryption**: The app supports encrypting `pwd.db` using SQLCipher.
- 💡 **Recommendations**:
  - **Enable Password Protection** to prevent unauthorized file access.
  - **Remember your Master Password**. Losing it means losing your data forever.
  - Backup regularly.
  - Avoid using on public/shared computers.

## �️ Roadmap

- [x] Database Encryption
- [x] Master Password Protection
- [x] Pin Passwords
- [ ] Password Strength Meter
- [ ] Categories/Tags
- [ ] Import/Export (CSV, JSON)
- [ ] Auto-fill (Browser Extension)
- [ ] Cross-platform (macOS, Linux)
- [ ] Auto-backup
- [ ] Password Expiry Alerts
- [ ] 2FA Support

## 📝 Tech Stack

- **Frontend**: HTML5 + CSS3 + JavaScript (Vanilla)
- **Backend**: Rust
- **Framework**: [Tauri](https://tauri.app/) 2.0
- **Database**: SQLite 3 (with SQLCipher encryption)
- **Build Tool**: Cargo + pnpm

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📄 License

[MIT License](LICENSE)

## ⚠️ Disclaimer

This software is for personal use and learning purposes. Please safeguard your data (especially your master password). The author is not responsible for any data loss or security issues.
