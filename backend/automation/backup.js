// automation/backup.js — Otomatik SQLite yedekleme
'use strict';

const fs   = require('fs');
const path = require('path');

const DB_PATH      = path.join(__dirname, '..', 'data', 'crypto_analyst.db');
const BACKUP_DIR   = path.join(__dirname, '..', 'data', 'backups');
const MAX_BACKUPS  = 7; // En fazla kaç yedek tutulsun

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log('[Backup] Yedek klasörü oluşturuldu:', BACKUP_DIR);
  }
}

function getBackupFileName() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');
  const h   = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `crypto_analyst_${y}-${m}-${d}_${h}${min}.db`;
}

function pruneOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('crypto_analyst_') && f.endsWith('.db'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time); // en yeni önce

    const toDelete = files.slice(MAX_BACKUPS);
    toDelete.forEach(f => {
      fs.unlinkSync(path.join(BACKUP_DIR, f.name));
      console.log('[Backup] Eski yedek silindi:', f.name);
    });
  } catch (err) {
    console.error('[Backup] Prune hatası:', err.message);
  }
}

async function runBackup() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.warn('[Backup] Veritabanı bulunamadı:', DB_PATH);
      return { success: false, error: 'DB bulunamadı' };
    }

    ensureBackupDir();

    const fileName   = getBackupFileName();
    const destPath   = path.join(BACKUP_DIR, fileName);
    const startTime  = Date.now();

    // Dosyayı kopyala
    fs.copyFileSync(DB_PATH, destPath);

    const elapsed  = Date.now() - startTime;
    const sizeKb   = Math.round(fs.statSync(destPath).size / 1024);

    console.log(`✅ [Backup] Yedek alındı: ${fileName} (${sizeKb} KB, ${elapsed}ms)`);

    // Eski yedekleri temizle
    pruneOldBackups();

    // Mevcut yedek listesini logla
    const remaining = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('crypto_analyst_') && f.endsWith('.db'));
    console.log(`[Backup] Mevcut yedekler (${remaining.length}/${MAX_BACKUPS}):`, remaining.join(', '));

    return { success: true, fileName, sizeKb, elapsed };
  } catch (err) {
    console.error('❌ [Backup] Yedekleme başarısız:', err.message);
    return { success: false, error: err.message };
  }
}

// Yedek listesini döndür (admin API için)
function listBackups() {
  try {
    ensureBackupDir();
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('crypto_analyst_') && f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          name:    f,
          sizeKb:  Math.round(stat.size / 1024),
          created: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));
  } catch {
    return [];
  }
}

module.exports = { runBackup, listBackups };
