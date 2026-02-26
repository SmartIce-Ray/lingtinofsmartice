// Chat Controller - API endpoints for AI assistant
// v1.4 - Added role_code, user_name, employee_id for role-based prompts and chat history

import { Controller, Post, Get, Body, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // POST /api/chat/message - Stream response
  @Post('message')
  async sendMessage(
    @Body('message') message: string,
    @Body('restaurant_id') restaurantId: string,
    @Body('session_id') sessionId: string | undefined,
    @Body('history') history: Array<{ role: string; content: string }> | undefined,
    @Body('role_code') roleCode: string | undefined,
    @Body('user_name') userName: string | undefined,
    @Body('employee_id') employeeId: string | undefined,
    @Body('managed_restaurant_ids') managedRestaurantIds: string[] | null | undefined,
    @Res() res: Response,
  ) {
    console.log('[ChatController] POST /api/chat/message');
    console.log('[ChatController] message:', message);
    console.log('[ChatController] restaurantId:', restaurantId);
    console.log('[ChatController] roleCode:', roleCode);
    console.log('[ChatController] userName:', userName);
    console.log('[ChatController] managedRestaurantIds:', managedRestaurantIds?.length ?? 'all');
    console.log('[ChatController] history length:', history?.length || 0);

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    console.log('[ChatController] Headers set, calling streamResponse');
    await this.chatService.streamResponse(
      message,
      restaurantId,
      sessionId,
      history,
      roleCode,
      userName,
      employeeId,
      res,
      managedRestaurantIds || null,
    );
    console.log('[ChatController] streamResponse completed');
  }

  // GET /api/chat/sessions - List chat sessions
  @Get('sessions')
  async getSessions(@Query('restaurant_id') restaurantId: string) {
    console.log('[ChatController] GET /api/chat/sessions');
    return this.chatService.getSessions(restaurantId);
  }
}
