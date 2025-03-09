import axios from 'axios';

export interface Participant {
  id: number;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  status: 'pending' | 'invited' | 'failed';
}

export interface TargetGroup {
  id: number;
  isChannel: boolean;
}

export interface GetParticipantsResponse {
  success: boolean;
  message: string;
  participants: Participant[];
  targetGroup: TargetGroup;
}

interface InvitedUser {
  id: number;
  groupId: string;
}

interface DelayRange {
  min: number;
  max: number;
}

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
    previouslyInvited: InvitedUser[];
    maxPerGroup: number;
    delayRange: DelayRange;
    maxMessages: number;
  }): Promise<GetParticipantsResponse> {
    try {
      const response = await axios.post('/api/getParticipants', data);
      return response.data;
    } catch (error: any) {
      console.error('Error getting participants:', error);
      throw error.response ? error.response.data : error;
    }
  }

  async inviteParticipant(data: {
    sessionId: string;
    participant: Participant;
  }) {
    try {
      const response = await axios.post('/api/inviteParticipant', data);
      return response.data;
    } catch (error: any) {
      console.error('Error inviting participant:', error);
      throw error.response ? error.response.data : error;
    }
  }

  async startBackgroundInvite(data: {
    sessionId: string;
    delayRange: DelayRange;
    participants: Participant[];
  }) {
    try {
      const response = await axios.post('/api/startBackgroundInvite', data);
      return response.data;
    } catch (error: any) {
      console.error('Error starting background invite:', error);
      throw error.response ? error.response.data : error;
    }
  }

  async inviteByPhoneNumbers(data: {
    sessionId: string;
    phoneNumbers: string[];
    targetGroup: string;
    delayRange: DelayRange;
  }) {
    try {
      const response = await axios.post('/api/inviteByPhoneNumbers', data);
      return response.data;
    } catch (error: any) {
      console.error('Error inviting by phone numbers:', error);
      throw error.response ? error.response.data : error;
    }
  }
}

export const telegramService = new TelegramService();