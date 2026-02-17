// 讯飞 Speech-to-Text Service - 方言识别大模型 (SLM)
// v2.2 - Added mp4/m4a format detection for mobile Safari recordings
// API文档: https://www.xfyun.cn/doc/spark/spark_slm_iat.html

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as WebSocket from 'ws';
import { fetchWithRetry } from '../../common/utils/fetch-with-retry';

const execAsync = promisify(exec);

// 讯飞方言大模型 API Configuration
const XUNFEI_WSS_URL = 'wss://iat.cn-huabei-1.xf-yun.com/v1';
const XUNFEI_HOST = 'iat.cn-huabei-1.xf-yun.com';
const XUNFEI_PATH = '/v1';
const FRAME_SIZE = 1280;
const FRAME_INTERVAL = 40;
const STT_TIMEOUT_MS = 60000;

// 方言大模型响应格式
interface SlmResponse {
  header: {
    code: number;
    message: string;
    sid: string;
    status: number;
  };
  payload?: {
    result?: {
      text: string; // base64 编码的 JSON
    };
  };
}

// base64 解码后的识别结果
interface SlmResultText {
  ws: Array<{
    bg: number;
    cw: Array<{ w: string; wp?: string }>;
  }>;
}

@Injectable()
export class XunfeiSttService {
  private readonly logger = new Logger(XunfeiSttService.name);

  async transcribe(audioUrl: string, timeoutMs: number = STT_TIMEOUT_MS): Promise<string> {
    const appId = process.env.XUNFEI_APP_ID;
    const apiKey = process.env.XUNFEI_API_KEY;
    const apiSecret = process.env.XUNFEI_API_SECRET;

    if (!appId || !apiKey || !apiSecret) {
      throw new Error('讯飞 credentials not configured');
    }

    // Step 1: Download audio
    const audioBuffer = await this.downloadAudio(audioUrl);
    this.logger.log(`Audio downloaded: ${(audioBuffer.length / 1024).toFixed(1)}KB`);

    // Step 2: Convert to PCM if needed
    const format = this.detectAudioFormat(audioUrl, audioBuffer);
    let pcmBuffer: Buffer;
    if (format === 'pcm') {
      pcmBuffer = audioBuffer;
    } else {
      pcmBuffer = await this.convertToPcm(audioBuffer, format);
      this.logger.log(`Converted ${format}→PCM: ${(pcmBuffer.length / 1024).toFixed(1)}KB`);
    }

    // Step 3: Send to 讯飞 STT
    const wsUrl = this.buildAuthUrl(apiKey, apiSecret);
    const transcript = await this.sendAudioAndGetTranscript(wsUrl, appId, pcmBuffer, timeoutMs);

    return transcript;
  }

  private detectAudioFormat(url: string, buffer: Buffer): string {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('.webm')) return 'webm';
    if (urlLower.includes('.mp4') || urlLower.includes('.m4a')) return 'mp4';
    if (urlLower.includes('.wav')) return 'wav';
    if (urlLower.includes('.mp3')) return 'mp3';
    if (urlLower.includes('.ogg')) return 'ogg';
    if (urlLower.includes('.pcm')) return 'pcm';

    if (buffer.length >= 4) {
      if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'webm';
      if (buffer.toString('ascii', 0, 4) === 'RIFF') return 'wav';
      if ((buffer[0] === 0xff && buffer[1] === 0xfb) || buffer.toString('ascii', 0, 3) === 'ID3') return 'mp3';
      if (buffer.toString('ascii', 0, 4) === 'OggS') return 'ogg';
      // MP4/M4A: 'ftyp' at offset 4
      if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
    }
    return 'webm';
  }

  private async downloadAudio(url: string): Promise<Buffer> {
    const response = await fetchWithRetry(url, undefined, {
      maxRetries: 3,
      baseDelayMs: 1000,
    });
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async convertToPcm(audioBuffer: Buffer, originalFormat: string): Promise<Buffer> {
    const tempDir = os.tmpdir();
    const inputFile = path.join(tempDir, `input_${Date.now()}.${originalFormat}`);
    const outputFile = path.join(tempDir, `output_${Date.now()}.pcm`);

    try {
      fs.writeFileSync(inputFile, audioBuffer);
      const ffmpegCmd = `ffmpeg -i "${inputFile}" -ar 16000 -ac 1 -f s16le "${outputFile}" -y 2>/dev/null`;
      await execAsync(ffmpegCmd);
      return fs.readFileSync(outputFile);
    } finally {
      try {
        if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // 方言大模型鉴权URL构建
  private buildAuthUrl(apiKey: string, apiSecret: string): string {
    const date = new Date().toUTCString();

    const signatureOrigin = `host: ${XUNFEI_HOST}\ndate: ${date}\nGET ${XUNFEI_PATH} HTTP/1.1`;
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(signatureOrigin)
      .digest('base64');

    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');

    const params = new URLSearchParams({ authorization, date, host: XUNFEI_HOST });
    return `${XUNFEI_WSS_URL}?${params.toString()}`;
  }

  // 方言大模型WebSocket通信 + 响应解析（非流式，直接拼接最终结果）
  private sendAudioAndGetTranscript(wsUrl: string, appId: string, audioBuffer: Buffer, timeoutMs: number = STT_TIMEOUT_MS): Promise<string> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const transcriptParts: string[] = [];
      let frameIndex = 0;
      const totalFrames = Math.ceil(audioBuffer.length / FRAME_SIZE);
      let isResolved = false;

      const resolveWithResults = (reason: string) => {
        if (isResolved) return;
        isResolved = true;
        const finalTranscript = transcriptParts.join('');
        this.logger.log(`STT完成(${reason}): ${finalTranscript.length}字`);
        resolve(finalTranscript);
      };

      const timeout = setTimeout(() => {
        ws.close();
        if (transcriptParts.length > 0) {
          resolveWithResults('timeout-partial');
        } else {
          reject(new Error(`STT超时(${timeoutMs / 1000}s)`));
        }
      }, timeoutMs);

      ws.on('open', () => {
        this.logger.log(`STT开始(方言大模型): ${totalFrames}帧`);
        this.sendFrames(ws, appId, audioBuffer, frameIndex, totalFrames);
      });

      ws.on('message', (data: Buffer) => {
        try {
          const response: SlmResponse = JSON.parse(data.toString());

          if (response.header.code !== 0) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(`STT错误: ${response.header.code} - ${response.header.message}`));
            return;
          }

          // 解析 base64 编码的识别结果，直接追加
          if (response.payload?.result?.text) {
            const decoded = Buffer.from(response.payload.result.text, 'base64').toString('utf-8');
            const result: SlmResultText = JSON.parse(decoded);
            const text = result.ws
              ?.map((w) => w.cw.map((c) => c.w).join(''))
              .join('') || '';
            if (text) transcriptParts.push(text);
          }

          // status=2 表示识别结束
          if (response.header.status === 2) {
            clearTimeout(timeout);
            ws.close();
            resolveWithResults('complete');
          }
        } catch (error) {
          // Ignore parse errors
        }
      });

      ws.on('error', (error: Error) => {
        clearTimeout(timeout);
        if (transcriptParts.length > 0) {
          resolveWithResults('error-partial');
        } else {
          reject(new Error(`WebSocket错误: ${error.message}`));
        }
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        if (!isResolved && transcriptParts.length > 0) {
          resolveWithResults('closed');
        }
      });
    });
  }

  // 方言大模型帧发送：每帧都需要 header.status
  private sendFrames(ws: WebSocket, appId: string, audioBuffer: Buffer, startFrame: number, totalFrames: number): void {
    let frameIndex = startFrame;

    const sendNext = () => {
      if (ws.readyState !== WebSocket.OPEN) return;

      const start = frameIndex * FRAME_SIZE;
      const end = Math.min(start + FRAME_SIZE, audioBuffer.length);
      const chunk = audioBuffer.subarray(start, end);

      let status: number;
      if (frameIndex === 0) {
        status = 0;
      } else if (frameIndex >= totalFrames - 1) {
        status = 2;
      } else {
        status = 1;
      }

      // 方言大模型：每帧都需要 header + payload
      const message: any = {
        header: { app_id: appId, status },
        payload: {
          audio: {
            encoding: 'raw',
            sample_rate: 16000,
            channels: 1,
            bit_depth: 16,
            status,
            seq: frameIndex,
            audio: chunk.toString('base64'),
          },
        },
      };

      // 首帧携带 parameter
      if (frameIndex === 0) {
        message.parameter = {
          iat: {
            language: 'zh_cn',
            accent: 'mulacc',   // 多方言自动识别(202种方言)
            domain: 'slm',      // 方言大模型
            eos: 10000,         // 静音检测(ms)，最大值防止对话停顿被截断
            ptt: 1,             // 开启标点
            nunum: 1,           // 数字规整
            result: {
              encoding: 'utf8',
              compress: 'raw',
              format: 'json',
            },
          },
        };
      }

      ws.send(JSON.stringify(message));
      frameIndex++;

      if (status !== 2) {
        setTimeout(sendNext, FRAME_INTERVAL);
      }
    };

    sendNext();
  }
}
