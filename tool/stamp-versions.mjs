#!/usr/bin/env node
/**
 * tool/stamp-versions.mjs — 自動化靜態資源內容雜湊（?v=<sha256-8>）生成工具
 * ----------------------------------------------------------------------------
 * 解決問題：
 *   Service Worker 採用 stale-while-revalidate 快取同源 JS/CSS，依賴 URL 上的
 *   `?v=` 參數觸發快取換代。若手動維護 `?v=202610xx`，一旦修改深層子模組
 *   （如 js/domains/consultation/save.js）卻漏改上層匯總檔（index.js → js/app.js
 *   → system.html）的 `?v=`，瀏覽器與 SW 會繼續回放舊快取。
 *
 * 運作原理：
 *   1. 取每個本地 .js / .css 檔案內容的 SHA-256 前 8 碼作為版本雜湊。
 *   2. 先對所有前端 JS 模組（ESM import/export、lazy-loader.js、video-loader.js）
 *      進行「由下而上（Bottom-Up）固定點迭代」：
 *      底層模組內容改變 → 自動更新中層模組的 import `?v=` → 中層模組內容隨之改變
 *      → 自動更新頂層 js/app.js 的 `?v=`，直到所有 JS 檔案收斂無變化。
 *   3. 最後掃描所有 HTML 檔案（system.html、index.html、video/room.html 等），
 *      將 <script src="..."> 與 <link href="..."> 的本地 .js / .css 統一蓋上最新雜湊。
 *
 * 用法：
 *   node tool/stamp-versions.mjs          # 直接更新所有檔案中的 ?v=<hash>
 *   node tool/stamp-versions.mjs --check  # 僅檢查是否全部同步（不同步時 exit 1）
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CHECK_ONLY = process.argv.includes('--check');

/** 不加 ?v= 的特殊路徑（例如 Service Worker 本身必須固定為 /sw.js） */
const EXCLUDED_ASSET_PATHS = new Set(['sw.js']);

/** 虛擬檔案系統快取：relPath (posix) -> string content */
const textFileCache = new Map();
/** 二進位／任意檔案雜湊快取：relPath (posix) -> 8-char hex hash */
const hashCache = new Map();
/** 記錄有發生內容變更的檔案：Set<relPath (posix)> */
const modifiedFiles = new Set();

function toPosix(p) {
    return p.split(path.sep).join('/');
}

function computeHash(bufferOrString) {
    return crypto.createHash('sha256').update(bufferOrString).digest('hex').slice(0, 8);
}

function getFileHash(relPosixPath) {
    if (textFileCache.has(relPosixPath)) {
        return computeHash(textFileCache.get(relPosixPath));
    }
    if (hashCache.has(relPosixPath)) {
        return hashCache.get(relPosixPath);
    }
    const absPath = path.join(ROOT_DIR, relPosixPath);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
        return null;
    }
    const buf = fs.readFileSync(absPath);
    const h = computeHash(buf);
    hashCache.set(relPosixPath, h);
    return h;
}

function readTextFile(relPosixPath) {
    if (textFileCache.has(relPosixPath)) {
        return textFileCache.get(relPosixPath);
    }
    const absPath = path.join(ROOT_DIR, relPosixPath);
    const content = fs.readFileSync(absPath, 'utf8');
    textFileCache.set(relPosixPath, content);
    return content;
}

function updateTextFile(relPosixPath, newContent) {
    const prev = readTextFile(relPosixPath);
    if (prev === newContent) return false;
    textFileCache.set(relPosixPath, newContent);
    hashCache.set(relPosixPath, computeHash(newContent));
    modifiedFiles.add(relPosixPath);
    return true;
}

/**
 * 將引用路徑（可為相對路徑 `./foo.js?v=123` 或根路徑 `/css/tailwind.css?v=123`）
 * 解析為相對於專案根目錄的 posix 路徑，並回傳附加最新 `?v=<hash>` 後的字串。
 */
function resolveAndStampUrl(rawRef, importerRelPosixPath) {
    if (!rawRef || typeof rawRef !== 'string') return rawRef;
    const trimmed = rawRef.trim();
    if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('/cdn-cgi/')
    ) {
        return rawRef;
    }

    const qIdx = trimmed.indexOf('?');
    const cleanRef = qIdx >= 0 ? trimmed.slice(0, qIdx) : trimmed;
    if (!cleanRef.endsWith('.js') && !cleanRef.endsWith('.css')) {
        return rawRef;
    }

    let targetRelPosix;
    if (cleanRef.startsWith('/')) {
        targetRelPosix = cleanRef.replace(/^\/+/, '');
    } else {
        const importerDir = path.posix.dirname(importerRelPosixPath);
        targetRelPosix = path.posix.normalize(
            importerDir === '.' ? cleanRef : `${importerDir}/${cleanRef}`
        );
    }

    if (EXCLUDED_ASSET_PATHS.has(targetRelPosix)) {
        return rawRef;
    }

    const hash = getFileHash(targetRelPosix);
    if (!hash) {
        return rawRef;
    }
    return `${cleanRef}?v=${hash}`;
}

/** 收集需要處理的 JS 模組檔案（不含 functions/ 後端與 node_modules/、vendor/） */
function collectFrontendJsFiles() {
    const results = [];
    if (fs.existsSync(path.join(ROOT_DIR, 'firebase_init.js'))) {
        results.push('firebase_init.js');
    }
    if (fs.existsSync(path.join(ROOT_DIR, 'video/video-loader.js'))) {
        results.push('video/video-loader.js');
    }

    function walkJsDir(relDir) {
        const absDir = path.join(ROOT_DIR, relDir);
        if (!fs.existsSync(absDir)) return;
        for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
            const childRel = `${relDir}/${entry.name}`;
            if (entry.isDirectory()) {
                if (entry.name === 'vendor') continue;
                walkJsDir(childRel);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                results.push(childRel);
            }
        }
    }

    walkJsDir('js');
    return results.sort();
}

/** 收集所有前端 HTML 檔案 */
function collectHtmlFiles() {
    const results = [];
    const skipDirs = new Set(['.git', 'node_modules', '.wrangler', 'functions', 'images', 'landing', 'data', 'css', 'js', 'tool']);

    function walk(relDir) {
        const absDir = relDir ? path.join(ROOT_DIR, relDir) : ROOT_DIR;
        for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
            const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                if (skipDirs.has(entry.name)) continue;
                walk(childRel);
            } else if (entry.isFile() && entry.name.endsWith('.html')) {
                results.push(childRel);
            }
        }
    }

    walk('');
    return results.sort();
}

/**
 * 更新單一前端 JS 檔案中的：
 * 1) ESM import / export ... from './xxx.js(?v=...)'
 * 2) js/lib/lazy-loader.js 內的 'js/vendor/...(js|css)(?v=...)'
 * 3) video/video-loader.js 內的 'video/...js(?v=...)'
 */
function rewriteJsFileReferences(relPosixPath) {
    let content = readTextFile(relPosixPath);

    // 1. ESM import/export from '...'
    const esmFromRegex = /^(\s*(?:import|export)\b[\s\S]*?\bfrom\s+['"])(\.\.?\/[^'"]+\.js(?:\?v=[^'"]*)?)(['"])/gm;
    content = content.replace(esmFromRegex, (_match, prefix, spec, suffix) => {
        const stamped = resolveAndStampUrl(spec, relPosixPath);
        return `${prefix}${stamped}${suffix}`;
    });

    // 2. lazy-loader.js 與 video-loader.js 內的相依靜態資源字串（相對於根目錄解析）
    if (relPosixPath === 'js/lib/lazy-loader.js' || relPosixPath === 'video/video-loader.js') {
        const loaderAssetRegex = /(['"])((?:js\/vendor\/|video\/)[^'"]+\.(?:js|css)(?:\?v=[^'"]*)?)(['"])/g;
        content = content.replace(loaderAssetRegex, (_match, q1, assetUrl, q2) => {
            const stamped = resolveAndStampUrl(assetUrl, 'index.html');
            return `${q1}${stamped}${q2}`;
        });
    }

    return updateTextFile(relPosixPath, content);
}

/**
 * 更新 HTML 檔案中的 <script src="..."> 與 <link rel="stylesheet" href="...">
 */
function rewriteHtmlFileReferences(relPosixPath) {
    let content = readTextFile(relPosixPath);

    const htmlAssetRegex = /(<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*['"])([^'"]+\.(?:js|css)(?:\?v=[^'"]*)?)(['"][^>]*>)/gi;
    content = content.replace(htmlAssetRegex, (_match, prefix, assetUrl, suffix) => {
        const stamped = resolveAndStampUrl(assetUrl, relPosixPath);
        return `${prefix}${stamped}${suffix}`;
    });

    return updateTextFile(relPosixPath, content);
}

function main() {
    const jsFiles = collectFrontendJsFiles();
    const htmlFiles = collectHtmlFiles();

    // 階段 1：JS 模組由下而上固定點傳遞（最多 10 輪，實際樹深 <= 4）
    let pass = 0;
    while (pass < 10) {
        pass++;
        let anyChangedInPass = false;
        for (const jsFile of jsFiles) {
            if (rewriteJsFileReferences(jsFile)) {
                anyChangedInPass = true;
            }
        }
        if (!anyChangedInPass) break;
    }

    // 階段 2：HTML 檔案更新所有本地 JS / CSS 引用雜湊
    for (const htmlFile of htmlFiles) {
        rewriteHtmlFileReferences(htmlFile);
    }

    const changedList = [...modifiedFiles].sort();

    if (CHECK_ONLY) {
        if (changedList.length > 0) {
            console.error(`[version:check] 發現 ${changedList.length} 個檔案的 ?v= 版本雜湊尚未同步：`);
            for (const f of changedList) {
                console.error(`  - ${f}`);
            }
            console.error('請執行 "npm run version:assets" 自動更新版本雜湊。');
            process.exit(1);
        }
        console.log('[version:check] 所有靜態資源 ?v= 版本雜湊皆為最新狀態。');
        return;
    }

    for (const relPath of changedList) {
        const absPath = path.join(ROOT_DIR, relPath);
        fs.writeFileSync(absPath, textFileCache.get(relPath), 'utf8');
    }

    if (changedList.length === 0) {
        console.log('[version:assets] 所有檔案的 ?v= 版本雜湊皆已是最新，無需變更。');
    } else {
        console.log(`[version:assets] 已自動計算並更新 ${changedList.length} 個檔案的 ?v= 內容雜湊（共 ${pass} 輪收斂）：`);
        for (const f of changedList) {
            console.log(`  - ${f}`);
        }
    }
}

main();
