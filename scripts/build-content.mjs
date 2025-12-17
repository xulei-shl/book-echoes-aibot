#!/usr/bin/env node

/**
 * Build Content Script (优化版本)
 * 
 * 优化策略：
 * 1. 直接从源目录上传图片到 R2，不复制到 public/content
 * 2. 添加重试机制提高上传可靠性
 * 3. 仅在 R2 上传失败时才复制到本地作为兜底
 * 4. 减小 Git 仓库大小
 * 
 * Usage:
 *   node scripts/build-content.mjs 2025-09               # 兼容旧写法，仅处理月份牌
 *   node scripts/build-content.mjs month 2025-09         # 指定类型为月份牌
 *   node scripts/build-content.mjs sleeping 2025 新书推荐 # 睡美人（名称需加引号以保留空格）
 *   node scripts/build-content.mjs subject 2025 digital-heritage-dance     # 主题卡
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_FILES = ['.env.local', '.env'];

// Configuration
const SOURCES_DIR = path.join(PROJECT_ROOT, 'sources_data');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'public', 'content');
const PASS_COLUMN = '人工评选';
const PASS_VALUE = '通过';
const BARCODE_COLUMN = '书目条码';
const CALL_NUMBER_URL_TEMPLATE = 'https://vufind.library.sh.cn/Search/Results?searchtype=vague&lookfor={call_number}&type=CallNumber';
const CALL_NUMBER_URL_ENCODING = {
    '/': '%2F',
    '#': '%23',
    '*': '%2A',
    ' ': '%20',
    '+': '%2B',
    '=': '%3D',
    '?': '%3F',
    '&': '%26'
};

/**
 * Main execution function
 */
async function main() {
    let context;
    try {
        context = parseBuildContext(process.argv.slice(2));
    } catch (error) {
        console.error(`❌ ${error.message}`);
        printUsage();
        process.exit(1);
    }

    console.log(`\n📚 Building content for ${context.logLabel}...\n`);

    try {
        await loadEnvFiles();
        const r2Config = createR2Config();

        // Step 1: Clean target directory (only JSON files, images will be in R2)
        await cleanTargetDirectory(context.relativePath);

        // Step 2: Read and filter Excel data
        const books = await readAndFilterExcel(context.relativePath);
        console.log(`✅ Found ${books.length} books marked as "${PASS_VALUE}"\n`);

        // Step 3: Process resources (upload to R2, fallback to local)
        const assetsMap = await migrateResources(context.relativePath, books, r2Config);

        // Step 3.5: Copy MD files if they exist
        await copyMdFiles(context.relativePath);

        // Step 4: Generate metadata JSON file
        await copyMetadata(context.relativePath, books, assetsMap);

        console.log(`\n✨ Build completed successfully for ${context.logLabel}!\n`);
    } catch (error) {
        console.error(`\n❌ Build failed:`, error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

function parseBuildContext(args) {
    if (!args.length) {
        throw new Error('请输入构建类型与参数');
    }

    if (args.length === 1 && /^\d{4}-\d{2}$/.test(args[0])) {
        const year = args[0].slice(0, 4);
        return {
            type: 'month',
            relativePath: `${year}/${args[0]}`,
            logLabel: `月份牌 ${args[0]}`
        };
    }

    const [type, ...rest] = args;
    if (!type) {
        throw new Error('缺少构建类型（month | sleeping | subject）');
    }

    if (type === 'month') {
        const monthId = rest[0];
        if (!monthId || !/^\d{4}-\d{2}$/.test(monthId)) {
            throw new Error('月份牌参数需为 YYYY-MM');
        }
        const year = monthId.slice(0, 4);
        return {
            type: 'month',
            relativePath: `${year}/${monthId}`,
            logLabel: `月份牌 ${monthId}`
        };
    }

    if (type === 'sleeping' || type === 'subject') {
        const year = rest[0];
        const nameParts = rest.slice(1);
        if (!year || !/^\d{4}$/.test(year)) {
            throw new Error('年份需为 YYYY');
        }
        if (!nameParts.length) {
            throw new Error(`${type === 'sleeping' ? '睡美人' : '主题卡'} 需提供名称`);
        }
        const name = nameParts.join(' ');
        const subfolder = type === 'sleeping' ? 'new' : 'subject';
        const relativePath = `${year}/${subfolder}/${name}`;
        const labelPrefix = type === 'sleeping' ? '睡美人' : '主题卡';
        return {
            type,
            relativePath,
            logLabel: `${labelPrefix} ${year}-${name}`
        };
    }

    throw new Error(`未知类型：${type}`);
}

function printUsage() {
    console.log('\n用法示例:');
    console.log('  node scripts/build-content.mjs 2025-09');
    console.log('  node scripts/build-content.mjs month 2025-09');
    console.log('  node scripts/build-content.mjs sleeping 2025 \"新书推荐\"');
    console.log('  node scripts/build-content.mjs subject 2025 科幻\n');
}

/**
 * Step 1: Clean the target content directory
 */
async function cleanTargetDirectory(month) {
    const targetDir = path.join(CONTENT_DIR, month);

    try {
        await fs.rm(targetDir, { recursive: true, force: true });
        console.log(`🧹 Cleaned directory: content/${month}`);
    } catch (error) {
        console.log(`🧹 Target directory doesn't exist yet: content/${month}`);
    }

    // Create fresh directory
    await fs.mkdir(targetDir, { recursive: true });
    console.log(`📁 Created directory: content/${month}\n`);
}

/**
 * Step 2: Read Excel file and filter for approved books
 */
async function readAndFilterExcel(month) {
    const sourceDir = path.join(SOURCES_DIR, month);

    // Find the Excel file
    const files = await fs.readdir(sourceDir);
    const excelFile = files.find(f => f.endsWith('.xlsx'));

    if (!excelFile) {
        throw new Error(`No .xlsx file found in sources_data/${month}`);
    }

    const excelPath = path.join(sourceDir, excelFile);
    console.log(`📖 Reading Excel file: ${excelFile}`);

    // Read the Excel file
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const data = xlsx.utils.sheet_to_json(worksheet);

    // Filter for approved books
    const approvedBooks = data.filter(row => row[PASS_COLUMN] === PASS_VALUE);

    // Validate that all approved books have barcodes
    const invalidBooks = approvedBooks.filter(book => !book[BARCODE_COLUMN]);
    if (invalidBooks.length > 0) {
        console.warn(`⚠️  Warning: ${invalidBooks.length} approved books are missing barcodes and will be skipped`);
    }

    return approvedBooks.filter(book => book[BARCODE_COLUMN]);
}

/**
 * Step 3: Process resources - upload to R2, fallback to local
 */
async function migrateResources(month, books, r2Config) {
    const sourceDir = path.join(SOURCES_DIR, month);
    const targetDir = path.join(CONTENT_DIR, month);

    let successCount = 0;
    let errorCount = 0;
    const assetsMap = new Map();

    for (const book of books) {
        const barcode = String(book[BARCODE_COLUMN]);
        const bookSourceDir = path.join(sourceDir, barcode);
        const bookTargetDir = path.join(targetDir, barcode);
        const picTargetDir = path.join(bookTargetDir, 'pic');

        const assetRecord = {
            cardImageUrl: '',
            cardThumbnailUrl: '',
            coverImageUrl: '',
            coverThumbnailUrl: '',
            originalImageUrl: '',
            originalThumbnailUrl: ''
        };

        try {
            // Check if source directory exists
            try {
                await fs.access(bookSourceDir);
            } catch {
                console.warn(`⚠️  Skipping ${barcode}: Source directory not found`);
                errorCount++;
                continue;
            }

            // Define all image assets
            const imageAssets = [
                {
                    name: 'card',
                    sourcePath: path.join(bookSourceDir, `${barcode}-S.png`),
                    targetPath: path.join(bookTargetDir, `${barcode}.png`),
                    r2Key: buildR2Key(r2Config, 'content', month, barcode, `${barcode}.png`),
                    contentType: 'image/png',
                    urlField: 'cardImageUrl',
                    needsThumbnail: true,
                    thumbnailTargetPath: path.join(bookTargetDir, `${barcode}_thumb.jpg`),
                    thumbnailR2Key: buildR2Key(r2Config, 'content', month, barcode, `${barcode}_thumb.jpg`),
                    thumbnailUrlField: 'cardThumbnailUrl'
                },
                {
                    name: 'original',
                    sourcePath: path.join(bookSourceDir, `${barcode}.png`),
                    targetPath: path.join(bookTargetDir, `${barcode}_original.png`),
                    r2Key: buildR2Key(r2Config, 'content', month, barcode, `${barcode}_original.png`),
                    contentType: 'image/png',
                    urlField: 'originalImageUrl',
                    needsThumbnail: true,
                    thumbnailTargetPath: path.join(bookTargetDir, `${barcode}_original_thumb.jpg`),
                    thumbnailR2Key: buildR2Key(r2Config, 'content', month, barcode, `${barcode}_original_thumb.jpg`),
                    thumbnailUrlField: 'originalThumbnailUrl'
                },
                {
                    name: 'cover',
                    sourcePath: path.join(bookSourceDir, 'pic', 'cover.jpg'),
                    targetPath: path.join(picTargetDir, 'cover.jpg'),
                    r2Key: buildR2Key(r2Config, 'content', month, barcode, 'pic/cover.jpg'),
                    contentType: 'image/jpeg',
                    urlField: 'coverImageUrl',
                    needsThumbnail: true,
                    thumbnailTargetPath: path.join(picTargetDir, 'cover_thumb.jpg'),
                    thumbnailR2Key: buildR2Key(r2Config, 'content', month, barcode, 'pic/cover_thumb.jpg'),
                    thumbnailUrlField: 'coverThumbnailUrl'
                },
                {
                    name: 'qrcode',
                    sourcePath: path.join(bookSourceDir, 'pic', 'qrcode.png'),
                    targetPath: path.join(picTargetDir, 'qrcode.png'),
                    r2Key: buildR2Key(r2Config, 'content', month, barcode, 'pic/qrcode.png'),
                    contentType: 'image/png',
                    urlField: null, // QR code 不需要记录 URL
                    needsThumbnail: false
                }
            ];

            // Process each image asset
            for (const asset of imageAssets) {
                await processImageAsset(asset, month, barcode, r2Config, assetRecord);
            }

            successCount++;
            assetsMap.set(barcode, assetRecord);
            console.log(`✅ Processed: ${barcode}`);
        } catch (error) {
            console.error(`❌ Error processing ${barcode}:`, error.message);
            errorCount++;
        }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    return assetsMap;
}

/**
 * Process single image asset: upload to R2, fallback to local
 */
async function processImageAsset(asset, month, barcode, r2Config, assetRecord) {
    // Check if source file exists
    try {
        await fs.access(asset.sourcePath);
    } catch {
        console.warn(`⚠️  ${asset.name} not found for ${barcode}`);
        return;
    }

    // 1. Try to upload original image to R2 (with retry)
    const remoteUrl = await uploadFileToR2WithRetry(
        r2Config,
        asset.sourcePath,
        asset.r2Key,
        asset.contentType
    );

    if (remoteUrl) {
        // R2 upload successful, use remote URL
        if (asset.urlField) {
            assetRecord[asset.urlField] = remoteUrl;
        }
    } else {
        // R2 upload failed, copy to local as fallback
        console.warn(`⚠️  R2 upload failed for ${asset.name}, falling back to local copy`);
        try {
            await ensureDirectoryFor(asset.targetPath);
            await fs.copyFile(asset.sourcePath, asset.targetPath);
            if (asset.urlField) {
                const relativePath = buildLocalContentPath(month, barcode, path.basename(asset.targetPath));
                assetRecord[asset.urlField] = buildLocalPublicUrl(relativePath);
            }
        } catch (error) {
            console.error(`❌ Failed to copy ${asset.name} to local: ${error.message}`);
            return;
        }
    }

    // 2. Process thumbnail if needed
    if (asset.needsThumbnail) {
        // Generate thumbnail to buffer
        const thumbnailBuffer = await generateThumbnail(asset.sourcePath);

        if (thumbnailBuffer) {
            // Try to upload thumbnail to R2 (with retry)
            const thumbnailRemoteUrl = await uploadBufferToR2WithRetry(
                r2Config,
                thumbnailBuffer,
                asset.thumbnailR2Key,
                'image/jpeg'
            );

            if (thumbnailRemoteUrl) {
                // R2 upload successful
                assetRecord[asset.thumbnailUrlField] = thumbnailRemoteUrl;
            } else {
                // R2 upload failed, save to local
                console.warn(`⚠️  R2 upload failed for ${asset.name} thumbnail, falling back to local copy`);
                try {
                    await ensureDirectoryFor(asset.thumbnailTargetPath);
                    await fs.writeFile(asset.thumbnailTargetPath, thumbnailBuffer);
                    const relativePath = buildLocalContentPath(month, barcode, path.basename(asset.thumbnailTargetPath));
                    assetRecord[asset.thumbnailUrlField] = buildLocalPublicUrl(relativePath);
                } catch (error) {
                    console.error(`❌ Failed to save ${asset.name} thumbnail to local: ${error.message}`);
                }
            }
        }
    }
}

/**
 * Generate thumbnail, return Buffer
 */
async function generateThumbnail(sourcePath) {
    try {
        return await sharp(sourcePath)
            .resize(400, null, { withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
    } catch (error) {
        console.warn(`⚠️  Could not generate thumbnail for ${sourcePath}: ${error.message}`);
        return null;
    }
}

/**
 * Upload file to R2 with retry mechanism
 */
async function uploadFileToR2WithRetry(r2Config, filePath, key, contentType, maxRetries = 3) {
    if (!r2Config?.shouldUpload || !r2Config.client || !r2Config.bucket) {
        return null;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const fileBuffer = await fs.readFile(filePath);
            await r2Config.client.send(new PutObjectCommand({
                Bucket: r2Config.bucket,
                Key: key,
                Body: fileBuffer,
                ContentType: contentType
            }));

            const publicBase = r2Config.publicUrl?.replace(/\/$/, '');
            if (publicBase) {
                return `${publicBase}/${key}`;
            }
            return null;
        } catch (error) {
            if (attempt === maxRetries) {
                console.warn(`⚠️  Failed to upload ${key} after ${maxRetries} attempts: ${error.message}`);
                return null;
            }
            console.warn(`⚠️  Upload attempt ${attempt}/${maxRetries} failed for ${key}, retrying...`);
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
    return null;
}

/**
 * Upload buffer to R2 with retry mechanism
 */
async function uploadBufferToR2WithRetry(r2Config, buffer, key, contentType, maxRetries = 3) {
    if (!r2Config?.shouldUpload || !r2Config.client || !r2Config.bucket) {
        return null;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await r2Config.client.send(new PutObjectCommand({
                Bucket: r2Config.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType
            }));

            const publicBase = r2Config.publicUrl?.replace(/\/$/, '');
            if (publicBase) {
                return `${publicBase}/${key}`;
            }
            return null;
        } catch (error) {
            if (attempt === maxRetries) {
                console.warn(`⚠️  Failed to upload buffer ${key} after ${maxRetries} attempts: ${error.message}`);
                return null;
            }
            console.warn(`⚠️  Upload attempt ${attempt}/${maxRetries} failed for ${key}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
    return null;
}

/**
 * Generate encoded call number link for catalog lookup
 */
function buildCallNumberLink(callNumberRaw) {
    if (!callNumberRaw) {
        return '';
    }
    const normalized = String(callNumberRaw).trim();
    if (!normalized) {
        return '';
    }
    const encoded = Array.from(normalized)
        .map(char => CALL_NUMBER_URL_ENCODING[char] ?? char)
        .join('');
    return CALL_NUMBER_URL_TEMPLATE.replace('{call_number}', encoded);
}

/**
 * Step 4: Generate metadata JSON file with only filtered approved books
 */
async function copyMetadata(month, books, assetsMap = new Map()) {
    const targetDir = path.join(CONTENT_DIR, month);
    const targetJson = path.join(targetDir, 'metadata.json');

    // Define fields needed by frontend
    const frontendFields = [
        '书目条码',
        '豆瓣书名',
        '豆瓣副标题',
        '豆瓣原作名',
        '豆瓣作者',
        '豆瓣译者',
        '豆瓣出版社',
        '豆瓣出版年',
        '豆瓣页数',
        '豆瓣评分',
        '豆瓣评价人数',
        '索书号',
        'ISBN',
        '人工推荐语',
        '初评理由',
        '豆瓣内容简介',
        '豆瓣作者简介',
        '豆瓣目录',
        '豆瓣链接',
        '豆瓣封面图片链接',
        '豆瓣定价',
        '豆瓣装帧',
        '豆瓣丛书',
        '豆瓣出品方',
        '索书号链接'
    ];

    // Filter books to only include frontend-needed fields
    const optimizedBooks = books.map(book => {
        const filtered = {};
        frontendFields.forEach(field => {
            if (book[field] !== undefined && book[field] !== null && book[field] !== '') {
                filtered[field] = book[field];
            }
        });

        if (filtered['索书号']) {
            const callNumberLink = buildCallNumberLink(filtered['索书号']);
            if (callNumberLink) {
                filtered['索书号链接'] = callNumberLink;
            }
        }

        const barcode = String(book[BARCODE_COLUMN]);
        const assets = assetsMap.get(barcode);

        if (assets?.cardImageUrl) {
            filtered.cardImageUrl = assets.cardImageUrl;
        }
        if (assets?.cardThumbnailUrl) {
            filtered.cardThumbnailUrl = assets.cardThumbnailUrl;
        }
        if (assets?.coverImageUrl) {
            filtered.coverImageUrl = assets.coverImageUrl;
        }
        if (assets?.coverThumbnailUrl) {
            filtered.coverThumbnailUrl = assets.coverThumbnailUrl;
        }
        if (assets?.originalImageUrl) {
            filtered.originalImageUrl = assets.originalImageUrl;
        }
        if (assets?.originalThumbnailUrl) {
            filtered.originalThumbnailUrl = assets.originalThumbnailUrl;
        }

        return filtered;
    });

    // Write the filtered data to JSON file
    await fs.writeFile(targetJson, JSON.stringify(optimizedBooks, null, 2), 'utf-8');

    const originalSize = JSON.stringify(books).length;
    const optimizedSize = JSON.stringify(optimizedBooks).length;
    const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);

    console.log(`\n📋 Generated metadata.json with ${books.length} approved books`);
    console.log(`   📦 Size reduction: ${reduction}% (${(originalSize / 1024).toFixed(1)}KB → ${(optimizedSize / 1024).toFixed(1)}KB)`);
}

/**
 * Step 3.5: Copy MD files from source to target if they exist
 */
async function copyMdFiles(relativePath) {
    const sourceDir = path.join(SOURCES_DIR, relativePath);
    const targetDir = path.join(CONTENT_DIR, relativePath);

    try {
        // Check if source directory exists
        await fs.access(sourceDir);
        
        // Read all files in source directory
        const files = await fs.readdir(sourceDir);
        
        // Find MD files
        const mdFiles = files.filter(file => file.endsWith('.md'));
        
        if (mdFiles.length === 0) {
            console.log(`📝 No MD files found in sources_data/${relativePath}`);
            return;
        }
        
        // Copy each MD file
        for (const mdFile of mdFiles) {
            const sourcePath = path.join(sourceDir, mdFile);
            const targetPath = path.join(targetDir, mdFile);
            
            try {
                await fs.copyFile(sourcePath, targetPath);
                console.log(`📝 Copied MD file: ${mdFile}`);
            } catch (error) {
                console.error(`❌ Failed to copy MD file ${mdFile}:`, error.message);
            }
        }
        
        console.log(`✅ Copied ${mdFiles.length} MD file(s) to content/${relativePath}`);
    } catch (error) {
        console.log(`📝 Source directory not found or inaccessible: sources_data/${relativePath}`);
    }
}

function buildLocalContentPath(month, barcode, ...segments) {
    return path.posix.join('content', month, barcode, ...segments);
}

function buildLocalPublicUrl(relativePath) {
    if (!relativePath) {
        return '';
    }
    return `/${relativePath.replace(/^\/+/, '')}`;
}

async function ensureDirectoryFor(filePath) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
}

function buildR2Key(r2Config, ...segments) {
    const cleaned = segments
        .filter(Boolean)
        .map(segment => String(segment).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
    const base = (r2Config?.basePath ?? '').replace(/^\/+|\/+$/g, '');
    if (base) {
        cleaned.unshift(base);
    }
    return cleaned.filter(Boolean).join('/');
}

function createR2Config() {
    const shouldUploadEnv = (process.env.UPLOAD_TO_R2 ?? 'true').toLowerCase() !== 'false';
    const endpoint = process.env.R2_ENDPOINT;
    const bucket = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const basePath = (process.env.R2_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '');
    const publicUrl = (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/$/, '');

    let client = null;
    let enableUpload = shouldUploadEnv;

    if (enableUpload) {
        if (endpoint && bucket && accessKeyId && secretAccessKey) {
            client = new S3Client({
                region: 'auto',
                endpoint,
                credentials: {
                    accessKeyId,
                    secretAccessKey
                },
                forcePathStyle: true
            });
        } else {
            console.warn('⚠️  R2 配置信息缺失，跳过上传流程');
            enableUpload = false;
        }
    }

    return {
        client,
        bucket,
        basePath,
        publicUrl,
        shouldUpload: enableUpload && !!client
    };
}

async function loadEnvFiles() {
    for (const filename of ENV_FILES) {
        const envPath = path.join(PROJECT_ROOT, filename);
        try {
            const content = await fs.readFile(envPath, 'utf-8');
            applyEnvFile(content);
        } catch {
            // Ignore missing files
        }
    }
}

function applyEnvFile(content) {
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }
        const key = line.slice(0, separatorIndex).trim();
        if (!key || process.env[key]) {
            continue;
        }
        const valueRaw = line.slice(separatorIndex + 1).trim();
        const value = valueRaw.replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
    }
}

// Run the script
main();
