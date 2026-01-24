// 讯飞 Speech-to-Text Service
// v1.2 - Fixed WebSocket import for CommonJS compatibility
// Added webm to PCM conversion using ffmpeg

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as WebSocket from 'ws';

const execAsync = promisify(exec);

// 讯飞 API Configuration
const XUNFEI_WSS_URL = 'wss://iat-api.xfyun.cn/v2/iat';
const FRAME_SIZE = 1280; // Bytes per frame (40ms of 16kHz 16-bit mono audio)
const FRAME_INTERVAL = 40; // ms between frames

interface XunfeiResponse {
  code: number;
  message: string;
  sid: string;
  data?: {
    status: number;
    result?: {
      ws: Array<{
        cw: Array<{ w: string }>;
      }>;
    };
  };
}

@Injectable()
export class XunfeiSttService {
  private readonly logger = new Logger(XunfeiSttService.name);

  /**
   * Transcribe audio from URL using 讯飞 STT
   * Downloads audio, converts to PCM, sends via WebSocket, returns transcript
   */
  async transcribe(audioUrl: string): Promise<string> {
    const appId = process.env.XUNFEI_APP_ID;
    const apiKey = process.env.XUNFEI_API_KEY;
    const apiSecret = process.env.XUNFEI_API_SECRET;

    if (!appId || !apiKey || !apiSecret) {
      throw new Error('讯飞 credentials not configured (XUNFEI_APP_ID, XUNFEI_API_KEY, XUNFEI_API_SECRET)');
    }

    // Step 1: Download audio file
    this.logger.log(`Downloading audio from: ${audioUrl}`);
    const audioBuffer = await this.downloadAudio(audioUrl);
    this.logger.log(`Downloaded ${audioBuffer.length} bytes`);

    // Step 2: Detect format and convert to PCM if needed
    const format = this.detectAudioFormat(audioUrl, audioBuffer);
    this.logger.log(`Detected audio format: ${format}`);

    let pcmBuffer: Buffer;
    if (format === 'pcm') {
      pcmBuffer = audioBuffer;
    } else {
      this.logger.log(`Converting ${format} to PCM...`);
      pcmBuffer = await this.convertToPcm(audioBuffer, format);
    }

    // Step 3: Build authenticated WebSocket URL
    const wsUrl = this.buildAuthUrl(apiKey, apiSecret);
    this.logger.log(`Connecting to 讯飞 STT...`);

    // Step 4: Send audio and get transcript
    const transcript = await this.sendAudioAndGetTranscript(wsUrl, appId, pcmBuffer);
    this.logger.log(`Transcript received: "${transcript}"`);

    return transcript;
  }

  /**
   * Detect audio format from URL extension or buffer magic bytes
   */
  private detectAudioFormat(url: string, buffer: Buffer): string {
    // Check URL extension first
    const urlLower = url.toLowerCase();
    if (urlLower.includes('.webm')) return 'webm';
    if (urlLower.includes('.wav')) return 'wav';
    if (urlLower.includes('.mp3')) return 'mp3';
    if (urlLower.includes('.ogg')) return 'ogg';
    if (urlLower.includes('.pcm')) return 'pcm';

    // Check magic bytes
    if (buffer.length >= 4) {
      // WebM starts with 0x1A 0x45 0xDF 0xA3
      if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
        return 'webm';
      }
      // WAV starts with "RIFF"
      if (buffer.toString('ascii', 0, 4) === 'RIFF') {
        return 'wav';
      }
      // MP3 starts with 0xFF 0xFB or ID3
      if ((buffer[0] === 0xff && buffer[1] === 0xfb) || buffer.toString('ascii', 0, 3) === 'ID3') {
        return 'mp3';
      }
      // OGG starts with "OggS"
      if (buffer.toString('ascii', 0, 4) === 'OggS') {
        return 'ogg';
      }
    }

    // Default to webm (most common from browser recording)
    return 'webm';
  }

  /**
   * Download audio file from URL
   */
  private async downloadAudio(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Convert webm/other formats to PCM (16kHz, 16-bit, mono) using ffmpeg
   */
  private async convertToPcm(audioBuffer: Buffer, originalFormat: string): Promise<Buffer> {
    const tempDir = os.tmpdir();
    const inputFile = path.join(tempDir, `input_${Date.now()}.${originalFormat}`);
    const outputFile = path.join(tempDir, `output_${Date.now()}.pcm`);

    try {
      // Write input file
      fs.writeFileSync(inputFile, audioBuffer);

      // Convert to PCM using ffmpeg
      // -ar 16000: sample rate 16kHz
      // -ac 1: mono channel
      // -f s16le: signed 16-bit little-endian PCM
      const ffmpegCmd = `ffmpeg -i "${inputFile}" -ar 16000 -ac 1 -f s16le "${outputFile}" -y 2>/dev/null`;
      await execAsync(ffmpegCmd);

      // Read output file
      const pcmBuffer = fs.readFileSync(outputFile);
      this.logger.log(`Converted audio to PCM: ${pcmBuffer.length} bytes`);

      return pcmBuffer;
    } finally {
      // Cleanup temp files
      try {
        if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Build authenticated WebSocket URL with HMAC-SHA256 signature
   */
  private buildAuthUrl(apiKey: string, apiSecret: string): string {
    const host = 'iat-api.xfyun.cn';
    const path = '/v2/iat';
    const date = new Date().toUTCString();

    // Build signature string
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(signatureOrigin)
      .digest('base64');

    // Build authorization header
    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');

    // Build final URL
    const params = new URLSearchParams({
      authorization,
      date,
      host,
    });

    return `${XUNFEI_WSS_URL}?${params.toString()}`;
  }

  /**
   * Send audio via WebSocket and collect transcript
   */
  private sendAudioAndGetTranscript(
    wsUrl: string,
    appId: string,
    audioBuffer: Buffer,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const transcriptParts: string[] = [];
      let frameIndex = 0;
      const totalFrames = Math.ceil(audioBuffer.length / FRAME_SIZE);

      // Connection timeout
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('讯飞 STT timeout (30s)'));
      }, 30000);

      ws.on('open', () => {
        this.logger.log(`WebSocket connected, sending ${totalFrames} frames...`);
        this.sendFrames(ws, appId, audioBuffer, frameIndex, totalFrames);
      });

      ws.on('message', (data: Buffer) => {
        try {
          const response: XunfeiResponse = JSON.parse(data.toString());
          this.logger.log(`讯飞 response: code=${response.code}, message=${response.message}, status=${response.data?.status}`);

          if (response.code !== 0) {
            clearTimeout(timeout);
            ws.close();
            this.logger.error(`讯飞 STT error code: ${response.code} - ${response.message}`);
            reject(new Error(`讯飞 STT error: ${response.code} - ${response.message}`));
            return;
          }

          // Extract text from response
          if (response.data?.result?.ws) {
            for (const word of response.data.result.ws) {
              for (const cw of word.cw) {
                if (cw.w) {
                  this.logger.log(`讯飞 word: "${cw.w}"`);
                  transcriptParts.push(cw.w);
                }
              }
            }
          }

          // Check if this is the final response
          if (response.data?.status === 2) {
            clearTimeout(timeout);
            ws.close();
            const finalTranscript = transcriptParts.join('');
            this.logger.log(`Final transcript assembled: "${finalTranscript}"`);
            resolve(finalTranscript);
          }
        } catch (error) {
          this.logger.error(`Failed to parse response: ${error.message}`);
        }
      });

      ws.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${error.message}`));
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        // If we haven't resolved yet, return what we have
        if (transcriptParts.length > 0) {
          resolve(transcriptParts.join(''));
        }
      });
    });
  }

  /**
   * Send audio frames with proper status flags
   */
  private sendFrames(
    ws: WebSocket,
    appId: string,
    audioBuffer: Buffer,
    startFrame: number,
    totalFrames: number,
  ): void {
    let frameIndex = startFrame;

    const sendNext = () => {
      if (ws.readyState !== WebSocket.OPEN) return;

      const start = frameIndex * FRAME_SIZE;
      const end = Math.min(start + FRAME_SIZE, audioBuffer.length);
      const chunk = audioBuffer.subarray(start, end);

      // Determine status: 0 = first, 1 = middle, 2 = last
      let status: number;
      if (frameIndex === 0) {
        status = 0; // First frame
      } else if (frameIndex >= totalFrames - 1) {
        status = 2; // Last frame
      } else {
        status = 1; // Middle frame
      }

      const message = {
        common: {
          app_id: appId,
        },
        business: {
          language: 'zh_cn',
          domain: 'iat',
          accent: 'mandarin',
          vad_eos: 3000, // End of speech detection (3s silence)
          dwa: 'wpgs', // Enable dynamic correction
          ptt: 0, // No punctuation prediction
        },
        data: {
          status,
          format: 'audio/L16;rate=16000',
          encoding: 'raw',
          audio: chunk.toString('base64'),
        },
      };

      // Only include common and business in first frame
      if (frameIndex > 0) {
        delete (message as any).common;
        delete (message as any).business;
      }

      ws.send(JSON.stringify(message));
      frameIndex++;

      // Continue sending or stop
      if (status !== 2) {
        setTimeout(sendNext, FRAME_INTERVAL);
      }
    };

    sendNext();
  }
}
