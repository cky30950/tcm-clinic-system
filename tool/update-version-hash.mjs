#!/usr/bin/env node
/**
 * 自動化內容雜湊（Content Hash）版本更新工具
 * ------------------------------------------------------------
 * 掃描專案內所有前端 JS 模組與 HTML 頁面中的本地 .js / .css 引用，
 * 依檔案實際內容計算 SHA-256 前 8 碼雜湊並自動更新 `?v=<hash>`。
 *
 * 採多輪迭代收斂（Bottom-Up Propagation）：
 *   底層子模組變更 → 更新上層 index.js / app.js 的 import ?v= →
 *   上層檔案內容隨之改變並產生新雜湊 → 最終更新 HTML 入口引用。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGET_JS_FILES = [
    'firebase_init.js',
    'js/app.js',
    'js/lib/lazy-loader.js',
    'video/video-loader.js'
];

const TARGET_HTML_FILES = [
    'system.html',
    'index.html',
    'clinic.html',
    'inquiry.html',
    'member.html',
    'mobile-capture.html',
    'namecard.html',
    'privacy.html',
    'terms.html',
    'video/room.html'
];

function collectDomainJsFiles(dirRel) {
    const absDir = path.join(ROOT_DIR, dirRel);
    const results = [];
    if (!fs.existsSync(absDir)) return results;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        const relPath = path.posix.join(dirRel, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectDomainJsFiles(relPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(relPath);
        }
    }
    return results;
}

function computeFileHash(absPath) {
    const buf = fs.readFileSync(absPath);
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

/**
 * 解析引用路徑對應的專案本地實體檔案絕對路徑。
 */
function resolveLocalAsset(fromFileRel, refPath) {
    if (!refPath || /^(?:https?:|data:|blob:|mailto:|tel:|\/\/)/i.test(refPath)) {
        return null;
    }
    if (refPath.startsWith('/cdn-cgi/')) {
        return null;
    }
    const cleanPath = refPath.split('?')[0].split('#')[0];
    if (!cleanPath.endsWith('.js') && !cleanPath.endsWith('.css')) {
        return null;
    }
    let absTarget;
    if (cleanPath.startsWith('/')) {
        absTarget = path.join(ROOT_DIR, cleanPath.slice(1));
    } else if (cleanPath.startsWith('./') || cleanPath.startsWith('../')) {
        absTarget = path.resolve(ROOT_DIR, path.dirname(fromFileRel), cleanPath);
    } else {
        // 相對路徑：先嘗試相對於當前檔案所在目錄，再嘗試相對於專案根目錄
        const relToDir = path.resolve(ROOT_DIR, path.dirname(fromFileRel), cleanPath);
        absTarget = fs.existsSync(relToDir)
            ? relToDir
            : path.join(ROOT_DIR, cleanPath);
    }
    if (fs.existsSync(absTarget) && fs.statSync(absTarget).isFile()) {
        return absTarget;
    }
    return null;
}

function updateJsFile(fileRel) {
    const absFile = path.join(ROOT_DIR, fileRel);
    if (!fs.existsSync(absFile)) return false;
    const original = fs.readFileSync(absFile, 'utf8');
    // 匹配字串常值中的 'xxx.js?v=...' 或 'xxx.css?v=...'
    const updated = original.replace(
        /(['"])([^'"\s]+?\.(?:js|css))\?v=([A-Za-z0-9_-]+)\1/g,
        (match, quote, assetPath, oldHash) => {
            const targetAbs = resolveLocalAsset(fileRel, assetPath);
            if (!targetAbs) return match;
            const newHash = computeFileHash(targetAbs);
            if (newHash === oldHash) return match;
            return `${quote}${assetPath}?v=${newHash}${quote}`;
        }
    );
    if (updated !== original) {
        fs.writeFileSync(absFile, updated, 'utf8');
        return true;
    }
    return false;
}

function updateHtmlFile(fileRel) {
    const absFile = path.join(ROOT_DIR, fileRel);
    if (!fs.existsSync(absFile)) return false;
    const original = fs.readFileSync(absFile, 'utf8');
    // 匹配 HTML <script src="..."> 與 <link ... href="..."> 的本地 .js / .css
    const updated = original.replace(
        /(\b(?:src|href)=['"])([^'"\s]+?\.(?:js|css))(?:\?v=([A-Za-z0-9_-]+))?(['"])/g,
        (match, prefix, assetPath, oldHash, suffix) => {
            const targetAbs = resolveLocalAsset(fileRel, assetPath);
            if (!targetAbs) return match;
            const newHash = computeFileHash(targetAbs);
            if (oldHash === newHash) return match;
            return `${prefix}${assetPath}?v=${newHash}${suffix}`;
        }
    );
    if (updated !== original) {
        fs.writeFileSync(absFile, updated, 'utf8');
        return true;
    }
    return false;
}

function main() {
    const jsFiles = [
        ...collectDomainJsFiles('js/domains'),
        ...TARGET_JS_FILES
    ];

    let totalChangedFiles = new Set();
    const MAX_PASSES = 6;

    for (let pass = 1; pass <= MAX_PASSES; pass++) {
        let changedInPass = 0;
        for (const jsRel of jsFiles) {
            if (updateJsFile(jsRel)) {
                totalChangedFiles.add(jsRel);
                changedInPass++;
            }
        }
        for (const htmlRel of TARGET_HTML_FILES) {
            if (updateHtmlFile(htmlRel)) {
                totalChangedFiles.add(htmlRel);
                changedInPass++;
            }
        }
        if (changedInPass === 0) break;
    }

    if (totalChangedFiles.size > 0) {
        console.log(`[version-hash] 已更新 ${totalChangedFiles.size} 個檔案的 ?v= 內容雜湊：`);
        for (const f of totalChangedFiles) {
            console.log(`  - ${f}`);
        }
    } else {
        console.log('[version-hash] 所有本地資源的 ?v= 內容雜湊皆為最新。');
    }
}

main();
