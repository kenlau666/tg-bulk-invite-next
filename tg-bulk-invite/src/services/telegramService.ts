import axios from 'axios';

export class TelegramService {
  async connect(data: {
    apiId: string;
    apiHash: string;
    phoneNumber: string;
    code?: string;
    sessionId?: string;
  }) {
    try {
      const response = await axios.post('/api/connect', data, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return response.data; // Axios automatically parses the JSON response
    } catch (error: any) {
      console.error('Connection error:', error);
      throw error.response ? error.response.data : error; // Handle error response
    }
  }

  async getParticipants(data: {
    sourceGroups: string[];
    targetGroup: string;
    sessionId: string;
  }) {
    try {
      const response = await axios.post('/api/getParticipants', data, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return response.data; // Axios automatically parses the JSON response
    } catch (error: any) {
      console.error('Error getting participants:', error);
      throw error.response ? error.response.data : error; // Handle error response
    }
  }
}

export const telegramService = new TelegramService();