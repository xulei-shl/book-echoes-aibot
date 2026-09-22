#!/usr/bin/env node

/**
 * 原图显示优化辅助模块
 *
 * 随机漫步页要展示的是「原图」（横竖版不一、尺寸不一），而原图是 PNG，
 * 单张 0.5–1.1 MB，首屏 18 张会到 15MB 级别。这里提供把原图重新编码为
 * 体积可控的 WebP（等比缩放、不放大）并上传回 R2 的能力，供
 * scripts/build-random-index.mjs 预处理时调用。
 *
 * 复用 build-content.mjs 的 R2 约定：对象 key 包含 R2_BASE_PATH，
 * 公开 URL = `${R2_PUBLIC_URL}/${key}`。
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ENV_FILES = ['.env.local', '.env'];

/** 显示图最长边（等比缩放，不放大）。800px 足以覆盖卡片在 2x 屏上的清晰度。 */
export const DISPLAY_MAX_SIZE = 800;
/** WebP 质量：78 在体积与观感之间取得平衡。 */
export const DISPLAY_QUALITY = 78;

const FETCH_TIMEOUT_MS = 30_000;

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
        process.env[key] = valueRaw.replace(/^['"]|['"]$/g, '');
    }
}

export async function loadEnvFiles() {
    for (const filename of ENV_FILES) {
        try {
            const content = await fs.readFile(path.join(PROJECT_ROOT, filename), 'utf-8');
            applyEnvFile(content);
        } catch {
            // 缺少文件时忽略
        }
    }
}

export function createR2Config() {
    const shouldUploadEnv = (process.env.UPLOAD_TO_R2 ?? 'true').toLowerCase() !== 'false';
    const endpoint = process.env.R2_ENDPOINT;
    const bucket = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const basePath = (process.env.R2_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '');
    const publicUrl = (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/$/, '');

    let client = null;
    if (shouldUploadEnv && endpoint && bucket && accessKeyId && secretAccessKey) {
        client = new S3Client({
            region: 'auto',
            endpoint,
            credentials: { accessKeyId, secretAccessKey },
            forcePathStyle: true
        });
    }

    return {
        client,
        bucket,
        basePath,
        publicUrl,
        shouldUpload: shouldUploadEnv && !!client
    };
}

/**
 * 由原图 URL 推导显示图的 R2 key（与原图同目录，`_original.png` → `_original.webp`）。
 * URL 的 pathname 已包含 R2_BASE_PATH，因此直接沿用即可。
 * 不匹配约定的 URL 返回 null（这些条目跳过重编码，前端走占位图兜底）。
 */
export function buildDisplayKey(originalUrl) {
    if (!originalUrl) {
        return null;
    }
    let parsed;
    try {
        parsed = new URL(originalUrl);
    } catch {
        return null;
    }
    const match = decodeURIComponent(parsed.pathname).match(/^(.*)_original\.(?:png|jpe?g)$/i);
    if (!match) {
        return null;
    }
    return `${match[1]}_original.webp`.replace(/^\/+/, '');
}

async function fetchBuffer(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

/**
 * 读取远端图片的像素尺寸（用于按原始比例占位）。失败返回 null。
 */
export async function probeImageSize(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
        return null;
    }
    try {
        const buffer = await fetchBuffer(url);
        const metadata = await sharp(buffer).metadata();
        if (!metadata.width || !metadata.height) {
            return null;
        }
        return { width: metadata.width, height: metadata.height };
    } catch {
        return null;
    }
}

/**
 * 下载原图并生成 WebP 显示图，返回 buffer 与输出尺寸。
 */
export async function generateOriginalDisplay(originalUrl) {
    const buffer = await fetchBuffer(originalUrl);
    const { data, info } = await sharp(buffer)
        .rotate()
        .resize({
            width: DISPLAY_MAX_SIZE,
            height: DISPLAY_MAX_SIZE,
            fit: 'inside',
            withoutEnlargement: true
        })
        .webp({ quality: DISPLAY_QUALITY })
        .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
}

/**
 * 上传显示图到 R2，返回公开 URL；未配置 R2 时返回 null。
 */
export async function uploadDisplay(r2Config, key, buffer, maxRetries = 3) {
    if (!r2Config?.shouldUpload || !r2Config.client || !r2Config.bucket || !r2Config.publicUrl) {
        return null;
    }
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            await r2Config.client.send(new PutObjectCommand({
                Bucket: r2Config.bucket,
                Key: key,
                Body: buffer,
                ContentType: 'image/webp'
            }));
            return `${r2Config.publicUrl}/${key}`;
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
        }
    }
    return null;
}
