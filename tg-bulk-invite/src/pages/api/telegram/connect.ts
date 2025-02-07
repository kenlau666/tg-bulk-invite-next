import type { NextApiRequest, NextApiResponse } from 'next';
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

type ResponseData = {
  success: boolean;
  message: string;
  sessionId?: string;
};

// Store active clients (in production, use a proper database)
export const activeClients = new Map<string, {
  client: TelegramClient;
  phoneNumber: string;
  codePromise?: Promise<string>;
  codeResolver?: (code: string) => void;
}>();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { apiId, apiHash, phoneNumber, code } = req.body;
  const sessionId = req.body.sessionId || Math.random().toString(36).substring(7);

  try {
    // If we have a code, resolve the pending promise
    if (code && activeClients.has(sessionId)) {
      const clientData = activeClients.get(sessionId)!;
      if (clientData.codeResolver) {
        clientData.codeResolver(code);
        return res.status(200).json({
          success: true,
          message: 'Code received',
          sessionId
        });
      }
    }

    const stringSession = new StringSession();
    const client = new TelegramClient("session_name", parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });

    // Create a promise that will be resolved when we get the code
    let codeResolver: ((code: string) => void) | undefined;
    const codePromise = new Promise<string>((resolve) => {
      codeResolver = resolve;
    });

    // Store client and promise resolver
    activeClients.set(sessionId, {
      client,
      phoneNumber,
      codePromise,
      codeResolver
    });

    // Start the client in the background
    client.start({
      phoneNumber: async () => phoneNumber,
      password: async () => "",
      phoneCode: async () => {
        // Return a response to request the code and wait for it
        res.status(200).json({
          success: true,
          message: 'Please enter the verification code sent to your phone',
          sessionId
        });
        return await codePromise;
      },
      onError: (err) => console.log(err),
    }).then(async () => {
      // After successful connection
      const session = await client.session.save();
      console.log('Connected successfully, session:', session);
    }).catch((error) => {
      console.error('Connection error:', error);
    });

    // If we haven't sent a response yet, wait for the phoneCode callback
    if (!res.writableEnded) {
      return res.status(200).json({
        success: true,
        message: 'Connecting to Telegram...',
        sessionId
      });
    }

  } catch (error) {
    console.error('Connection error:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Telegram',
    });
  }
} 