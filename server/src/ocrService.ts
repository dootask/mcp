/* eslint-disable @typescript-eslint/no-explicit-any */

import Tesseract from 'tesseract.js';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import type { Logger } from 'pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const OCR_TIMEOUT = 60000; // 60 秒
const DEFAULT_LANGUAGES = ['chi_sim', 'eng'];

/** OCR 支持的图片格式 */
export const OCR_SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif'];

export interface OcrResult {
  text: string;
  confidence: number;
  languages: string[];
  file_name?: string;
  duration_ms: number;
}

export interface OcrRequest {
  image_url?: string;
  image_base64?: string;
}

export class OcrService {
  private worker: Tesseract.Worker | null = null;
  private workerLanguages: string[] = [];

  constructor(private readonly logger: Logger) {}

  /**
   * 获取或创建 OCR Worker（单例模式）
   */
  private async getWorker(languages: string[]): Promise<Tesseract.Worker> {
    const sortedLangs = [...languages].sort();
    const langsKey = sortedLangs.join('+');
    const currentKey = [...this.workerLanguages].sort().join('+');

    if (this.worker && langsKey === currentKey) {
      return this.worker;
    }

    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {
        // 忽略终止错误
      }
      this.worker = null;
      this.workerLanguages = [];
    }

    const tessdataPath = process.env.TESSDATA_PREFIX || '/app/tessdata';
    const langPath = fs.existsSync(tessdataPath) ? tessdataPath : undefined;

    this.logger.info({ languages: sortedLangs, langPath }, 'Creating OCR worker');

    const worker = await Tesseract.createWorker(sortedLangs, Tesseract.OEM.LSTM_ONLY, {
      langPath,
      cachePath: process.env.TESSDATA_CACHE || '/app/tessdata-cache',
      cacheMethod: 'readOnly',
      gzip: true,
    });

    this.worker = worker;
    this.workerLanguages = sortedLangs;

    return worker;
  }

  /**
   * 从 URL 获取图片
   */
  private async fetchImageFromUrl(imageUrl: string): Promise<{ buffer: Buffer; fileName: string }> {
    const urlObj = new URL(imageUrl);
    const extMatch = urlObj.pathname.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';

    if (ext && !OCR_SUPPORTED_FORMATS.includes(ext)) {
      throw new Error(`不支持的图片格式: ${ext}，支持格式: ${OCR_SUPPORTED_FORMATS.join(', ')}`);
    }

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: MAX_SIZE,
      headers: {
        'User-Agent': 'DooTask-MCP/1.0',
      },
    });

    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`URL 返回的不是图片类型: ${contentType}`);
    }

    return {
      buffer: Buffer.from(response.data),
      fileName: path.basename(urlObj.pathname) || 'image',
    };
  }

  /**
   * 从 Base64 解码图片
   */
  private decodeBase64Image(base64Data: string): Buffer {
    // 支持 data:image/xxx;base64,xxx 格式
    const matches = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    let data: string;
    let ext: string | undefined;

    if (matches) {
      ext = matches[1].toLowerCase();
      data = matches[2];
    } else {
      data = base64Data;
    }

    if (ext && !OCR_SUPPORTED_FORMATS.includes(ext)) {
      throw new Error(`不支持的图片格式: ${ext}，支持格式: ${OCR_SUPPORTED_FORMATS.join(', ')}`);
    }

    const buffer = Buffer.from(data, 'base64');

    if (buffer.length > MAX_SIZE) {
      throw new Error(`文件过大: ${(buffer.length / 1024 / 1024).toFixed(2)}MB，最大支持 10MB`);
    }

    return buffer;
  }

  /**
   * 执行 OCR 识别
   */
  async recognize(request: OcrRequest): Promise<OcrResult> {
    const startTime = Date.now();
    const { image_url, image_base64 } = request;
    const languages = DEFAULT_LANGUAGES;

    if (!image_url && !image_base64) {
      throw new Error('请提供 image_url 或 image_base64 参数');
    }

    let buffer: Buffer;
    let fileName = 'image';

    if (image_url) {
      const result = await this.fetchImageFromUrl(image_url);
      buffer = result.buffer;
      fileName = result.fileName;
    } else {
      // image_base64 必定存在（已在上方检查）
      buffer = this.decodeBase64Image(image_base64!);
      fileName = 'base64_image';
    }

    this.logger.info({ fileName, bufferSize: buffer.length, languages }, 'Starting OCR');

    const worker = await this.getWorker(languages);

    // 执行 OCR（带超时）
    const ocrPromise = worker.recognize(buffer);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('OCR 识别超时，请尝试使用更小的图片')), OCR_TIMEOUT);
    });

    const result = await Promise.race([ocrPromise, timeoutPromise]);

    const text = result.data.text.trim();
    const confidence = Math.round(result.data.confidence * 100) / 100;
    const durationMs = Date.now() - startTime;

    this.logger.info({ fileName, textLength: text.length, confidence, durationMs, languages }, 'OCR completed');

    return {
      text,
      confidence,
      languages,
      file_name: fileName,
      duration_ms: durationMs,
    };
  }

  /**
   * 处理 HTTP 请求
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // 只接受 POST 请求
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
      return;
    }

    try {
      // 解析请求体
      const body = await this.parseRequestBody(req);
      const request: OcrRequest = JSON.parse(body);

      // 执行 OCR
      const result = await this.recognize(request);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error: any) {
      this.logger.error({ err: error }, 'OCR request failed');

      const statusCode = error.message.includes('不支持') || error.message.includes('请提供') ? 400 : 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * 解析请求体
   */
  private parseRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      let rejected = false;
      const maxSize = 20 * 1024 * 1024; // 20MB（考虑 base64 编码后的大小）

      req.on('data', (chunk) => {
        if (rejected) return;

        body += chunk;
        if (body.length > maxSize) {
          rejected = true;
          req.destroy();
          reject(new Error('请求体过大'));
        }
      });

      req.on('end', () => {
        if (!rejected) {
          resolve(body);
        }
      });
      req.on('error', (err) => {
        if (!rejected) {
          reject(err);
        }
      });
    });
  }

  /**
   * 清理资源
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
        this.worker = null;
        this.workerLanguages = [];
        this.logger.info('OCR worker terminated');
      } catch (error: any) {
        this.logger.warn({ err: error }, 'Failed to terminate OCR worker');
      }
    }
  }
}
