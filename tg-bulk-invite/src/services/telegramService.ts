export class TelegramService {
  async connect(data: {
    apiId: string;
    apiHash: string;
    phoneNumber: string;
    code?: string;
    sessionId?: string;
  }) {
    try {
      const response = await fetch('/api/telegram/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to connect to Telegram');
      }

      return await response.json();
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  }

  async getParticipants(data: {
    sourceGroups: string[];
    targetGroup: string;
    sessionId: string;
  }) {
    try {
      const response = await fetch('/api/telegram/getParticipants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        console.log(response);
        throw new Error('Failed to get participants');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting participants:', error);
      throw error;
    }
  }
}

export const telegramService = new TelegramService();