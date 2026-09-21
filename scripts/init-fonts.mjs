#!/usr/bin/env node

/**
 * 字体初始化脚本
 *
 * 功能：
 * 1. 扫描 public/fonts 目录下的字体文件
 * 2. 转换字体格式（.woff -> .woff2）
 * 3. 上传到 Cloudflare R2 存储
 * 4. 生成字体元数据清单
 *
 * 使用：node scripts/init-fonts.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_FILES = ['.env.local', '.env'];

// 配置
const FONTS_DIR = path.join(PROJECT_ROOT, 'public', 'fonts');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'fonts_optimized');
const METADATA_FILE = path.join(PROJECT_ROOT, 'public', 'fonts', 'fonts-metadata.json');

// 支持的字体格式
const SUPPORTED_EXTENSIONS = ['.woff', '.woff2', '.ttf', '.otf'];

// 字体族名映射（根据文件名推断）
const FONT_FAMILY_MAP = {
  '上图东观体': 'ShangTuDongGuan',
  '又又意宋': 'YouYouYiSong',
  '汇文明朝体': 'HuiWenMingChao',
  '润植家如印奏章楷': 'RunZhiJiaRuYinZouZhangKai',
  '青柳隶书': 'QingLiuLiShu'
};

/**
 * 主执行函数
 */
async function main() {
  console.log('\n🔤 开始字体初始化流程...\n');

  try {
    // 加载环境变量
    await loadEnvFiles();
    const r2Config = createR2Config();

    // 加载现有元数据
    const existingMetadata = await loadMetadata();

    // 步骤 1: 扫描字体文件
    const allFontFiles = await scanFontFiles();

    // 过滤已处理的字体
    const processedFilenames = new Set((existingMetadata?.fonts || []).map(f => f.originalFilename));
    const fontFiles = [];
    const skippedFiles = [];

    for (const file of allFontFiles) {
      if (processedFilenames.has(file.filename)) {
        skippedFiles.push(file.filename);
      } else {
        fontFiles.push(file);
      }
    }

    if (skippedFiles.length > 0) {
      console.log(`⏭️  跳过 ${skippedFiles.length} 个已处理的字体文件`);
    }

    console.log(`✅ 发现 ${allFontFiles.length} 个字体文件 (新增 ${fontFiles.length} 个)\n`);

    let uploadedFonts = [];

    if (fontFiles.length > 0) {
      // 步骤 2: 转换字体格式
      const convertedFonts = await convertFonts(fontFiles);
      console.log(`✅ 转换完成 ${convertedFonts.length} 个字体\n`);

      // 步骤 3: 上传到 R2
      uploadedFonts = await uploadFonts(convertedFonts, r2Config);
      console.log(`✅ 上传完成 ${uploadedFonts.length} 个字体\n`);
    } else {
      console.log('✨ 没有新的字体文件需要处理。\n');
    }

    // 步骤 4: 生成元数据 (合并旧数据)
    // 保留现有元数据中仍然存在于磁盘的文件记录
    const currentFilenames = new Set(allFontFiles.map(f => f.filename));
    const validExistingFonts = (existingMetadata?.fonts || []).filter(f =>
      currentFilenames.has(f.originalFilename)
    );

    await generateMetadata(uploadedFonts, validExistingFonts);
    console.log(`✅ 生成字体元数据清单\n`);

    console.log('✨ 字体初始化完成！\n');

    // 输出使用说明
    if (uploadedFonts.length > 0) {
      printUsageGuide(uploadedFonts);
    }
  } catch {
    console.error('\n❌ 字体初始化失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 步骤 1: 扫描字体文件
 */
async function scanFontFiles() {
  console.log('📂 扫描字体目录:', FONTS_DIR);

  try {
    const files = await fs.readdir(FONTS_DIR);
    const fontFiles = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        const fullPath = path.join(FONTS_DIR, file);
        const stats = await fs.stat(fullPath);

        fontFiles.push({
          filename: file,
          path: fullPath,
          ext: ext,
          size: stats.size,
          basename: path.basename(file, ext)
        });

        console.log(`  📝 ${file} (${formatBytes(stats.size)})`);
      }
    }

    return fontFiles;
  } catch {
    throw new Error(`扫描字体文件失败: ${error.message}`);
  }
}

/**
 * 步骤 2: 转换字体格式
 */
async function convertFonts(fontFiles) {
  console.log('🔄 开始转换字体格式...');

  // 确保输出目录存在
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const convertedFonts = [];

  for (const font of fontFiles) {
    try {
      // 如果已经是 woff2 格式，直接复制
      if (font.ext === '.woff2') {
        const outputPath = path.join(OUTPUT_DIR, font.filename);
        await fs.copyFile(font.path, outputPath);

        convertedFonts.push({
          ...font,
          woff2Path: outputPath,
          converted: false
        });

        console.log(`  ✓ ${font.filename} (已是 woff2)`);
        continue;
      }

      // 转换为 woff2
      const woff2Filename = `${font.basename}.woff2`;
      const woff2Path = path.join(OUTPUT_DIR, woff2Filename);

      // 检查是否已安装 ttf2woff2 或 woff2_compress
      const converted = await tryConvertFont(font.path, woff2Path, font.ext);

      if (converted) {
        convertedFonts.push({
          ...font,
          woff2Path: woff2Path,
          woff2Filename: woff2Filename,
          converted: true
        });

        const stats = await fs.stat(woff2Path);
        const reduction = ((1 - stats.size / font.size) * 100).toFixed(1);
        console.log(`  ✓ ${font.filename} → ${woff2Filename} (压缩 ${reduction}%)`);
      } else {
        // 转换失败，保留原文件
        console.warn(`  ⚠️  ${font.filename} 转换失败，保留原格式`);
        const outputPath = path.join(OUTPUT_DIR, font.filename);
        await fs.copyFile(font.path, outputPath);

        convertedFonts.push({
          ...font,
          woff2Path: outputPath,
          converted: false
        });
      }
    } catch {
      console.error(`  ✗ ${font.filename} 转换出错: ${error.message}`);
    }
  }

  return convertedFonts;
}

/**
 * 尝试转换字体格式
 */
async function tryConvertFont(inputPath, outputPath, inputExt) {
  // 方法 1: 尝试使用 fonttools (Python)
  try {
    if (inputExt === '.woff') {
      // woff -> woff2 需要先解压再压缩
      await execFileAsync('python', ['-m', 'fontTools.ttLib.woff2', 'compress', inputPath, '-o', outputPath]);
      return true;
    } else if (inputExt === '.ttf' || inputExt === '.otf') {
      // ttf/otf -> woff2
      await execFileAsync('python', ['-m', 'fontTools.ttLib.woff2', 'compress', inputPath, '-o', outputPath]);
      return true;
    }
  } catch {
    // fonttools 不可用，尝试其他方法
  }

  // 方法 2: 尝试使用 woff2_compress (如果已安装)
  try {
    if (inputExt === '.ttf' || inputExt === '.otf') {
      await execFileAsync('woff2_compress', [inputPath]);
      // woff2_compress 会在同目录生成 .woff2 文件
      const autoWoff2Path = inputPath.replace(inputExt, '.woff2');
      await fs.rename(autoWoff2Path, outputPath);
      return true;
    }
  } catch {
    // woff2_compress 不可用
  }

  // 方法 3: 如果是 .woff，提示用户需要手动转换
  if (inputExt === '.woff') {
    console.warn(`    ℹ️  提示：需要安装 fonttools 来转换 woff 格式`);
    console.warn(`    运行: pip install fonttools brotli`);
  }

  return false;
}

/**
 * 步骤 3: 上传到 R2
 */
async function uploadFonts(fonts, r2Config) {
  console.log('☁️  开始上传字体到 R2...');

  const uploadedFonts = [];

  for (const font of fonts) {
    try {
      const r2Key = buildR2Key(r2Config, 'fonts', font.woff2Filename || font.filename);
      const contentType = getContentType(font.woff2Path || font.path);

      const remoteUrl = await uploadFileToR2(
        r2Config,
        font.woff2Path || font.path,
        r2Key,
        contentType
      );

      // 推断字体族名
      const fontFamily = inferFontFamily(font.basename);

      uploadedFonts.push({
        filename: font.woff2Filename || font.filename,
        originalFilename: font.filename,
        localPath: font.woff2Path || font.path,
        remoteUrl: remoteUrl,
        r2Key: r2Key,
        fontFamily: fontFamily,
        format: font.woff2Filename ? 'woff2' : font.ext.replace('.', ''),
        size: (await fs.stat(font.woff2Path || font.path)).size,
        converted: font.converted
      });

      if (remoteUrl) {
        console.log(`  ✓ ${font.filename} → ${remoteUrl}`);
      } else {
        console.warn(`  ⚠️  ${font.filename} 上传失败，将使用本地路径`);
      }
    } catch {
      console.error(`  ✗ ${font.filename} 上传出错: ${error.message}`);
    }
  }

  return uploadedFonts;
}

/**
 * 步骤 4: 生成元数据
 */
async function generateMetadata(newFonts, existingFonts = []) {
  console.log('📋 生成字体元数据...');

  const newFontMetadata = newFonts.map(font => ({
    fontFamily: font.fontFamily,
    filename: font.filename,
    originalFilename: font.originalFilename,
    format: font.format,
    url: font.remoteUrl || `/fonts/${font.filename}`,
    size: font.size,
    sizeFormatted: formatBytes(font.size),
    converted: font.converted,
    r2Key: font.r2Key
  }));

  const allFonts = [...existingFonts, ...newFontMetadata];

  const metadata = {
    generatedAt: new Date().toISOString(),
    totalFonts: allFonts.length,
    fonts: allFonts
  };

  await fs.writeFile(
    METADATA_FILE,
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );

  console.log(`  ✓ 元数据已保存到: ${METADATA_FILE}`);
}

/**
 * 加载现有元数据
 */
async function loadMetadata() {
  try {
    const content = await fs.readFile(METADATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 推断字体族名
 */
function inferFontFamily(basename) {
  for (const [key, value] of Object.entries(FONT_FAMILY_MAP)) {
    if (basename.includes(key)) {
      return value;
    }
  }
  // 使用文件名作为 fallback
  return basename.replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * 获取 Content-Type
 */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 输出使用说明
 */
function printUsageGuide(fonts) {
  console.log('📖 使用说明：');
  console.log('\n在 app/globals.css 中添加以下内容：\n');

  for (const font of fonts) {
    const url = font.remoteUrl || `/fonts/${font.filename}`;
    console.log(`@font-face {
  font-family: '${font.fontFamily}';
  src: url('${url}') format('${font.format}');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
`);
  }

  console.log('\n在组件中使用：');
  console.log(`<div style={{ fontFamily: '${fonts[0]?.fontFamily}' }}>文本内容</div>`);
}

// ============= R2 相关函数（复用 build-content.mjs 的逻辑） =============

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

async function uploadFileToR2(r2Config, filePath, key, contentType) {
  if (!r2Config?.shouldUpload || !r2Config.client || !r2Config.bucket) {
    console.warn('⚠️  R2 上传未启用，字体将保留在本地');
    return null;
  }

  try {
    const fileBuffer = await fs.readFile(filePath);
    await r2Config.client.send(new PutObjectCommand({
      Bucket: r2Config.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable' // 字体缓存 1 年
    }));

    const publicBase = r2Config.publicUrl?.replace(/\/$/, '');
    if (publicBase) {
      return `${publicBase}/${key}`;
    }
  } catch {
    console.warn(`⚠️  上传 ${key} 失败: ${error.message}`);
  }

  return null;
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
      // 忽略不存在的文件
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

// 运行脚本
main();
