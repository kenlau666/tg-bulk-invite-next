import Head from "next/head";
import { useState } from "react";
import TelegramLoginForm from "@/components/TelegramLoginForm";
import VerificationCodeForm from "@/components/VerificationCodeForm";
import { telegramService } from "@/services/telegramService";
import GroupSelectionForm from "@/components/GroupSelectionForm";
import InviteProgress from "@/components/InviteProgress";

interface Participant {
  id: number;
  firstName: string | null;
  status: 'invited' | 'skipped' | 'pending';
}

interface Stats {
  total: number;
  invited: number;
  skipped: number;
}

export default function Home() {
  const [status, setStatus] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | null;
  }>({ message: '', type: null });

  const [showVerificationForm, setShowVerificationForm] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [connectionData, setConnectionData] = useState<{
    apiId: string;
    apiHash: string;
    phoneNumber: string;
  } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, invited: 0, skipped: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFormSubmit = async (formData: {
    apiId: string;
    apiHash: string;
    phoneNumber: string;
  }) => {
    try {
      setStatus({ message: 'Connecting to Telegram...', type: 'info' });
      const result = await telegramService.connect(formData);
      
      if (result.sessionId) {
        setSessionId(result.sessionId);
        setConnectionData(formData);
        setShowVerificationForm(true);
      }
      
      setStatus({ message: result.message, type: 'info' });
    } catch (error) {
      setStatus({ 
        message: error instanceof Error ? error.message : 'An error occurred', 
        type: 'error' 
      });
    }
  };

  const handleVerificationSubmit = async (code: string) => {
    if (!connectionData || !sessionId) return;

    try {
      setStatus({ message: 'Verifying code...', type: 'info' });
      const result = await telegramService.connect({
        ...connectionData,
        code,
        sessionId
      });
      
      setStatus({ message: result.message, type: 'success' });
      setIsConnected(true);
      setShowVerificationForm(false);
    } catch (error) {
      setStatus({ 
        message: error instanceof Error ? error.message : 'An error occurred', 
        type: 'error' 
      });
    }
  };

  const handleGroupSelection = async (data: {
    sourceGroups: string[];
    targetGroup: string;
  }) => {
    try {
      setIsProcessing(true);
      setStatus({ message: 'Processing group members...', type: 'info' });
      const result = await telegramService.getParticipants({
        sourceGroups: data.sourceGroups,
        targetGroup: data.targetGroup,
        sessionId: sessionId
      });
      
      setParticipants(result.participants);
      setStats(result.stats);
      setStatus({ message: result.message, type: 'success' });
    } catch (error) {
      setStatus({ 
        message: error instanceof Error ? error.message : 'An error occurred', 
        type: 'error' 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Head>
        <title>Telegram Bulk Inviter</title>
        <meta name="description" content="Bulk invite members from multiple Telegram groups" />
      </Head>
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">
              Telegram Bulk Inviter
            </h1>
            {status.type && (
              <div className={`mb-4 p-4 rounded-md ${
                status.type === 'success' ? 'bg-green-50 text-green-700' :
                status.type === 'error' ? 'bg-red-50 text-red-700' :
                'bg-blue-50 text-blue-700'
              }`}>
                {status.message}
              </div>
            )}
            {!isConnected ? (
              !showVerificationForm ? (
                <TelegramLoginForm onSubmit={handleFormSubmit} />
              ) : (
                <VerificationCodeForm onSubmit={handleVerificationSubmit} />
              )
            ) : (
              <>
                <GroupSelectionForm onSubmit={handleGroupSelection} disabled={isProcessing} />
                {isProcessing && (
                  <div className="mt-4 text-center text-sm text-gray-500">
                    Processing... This may take a while.
                  </div>
                )}
                {participants.length > 0 && (
                  <InviteProgress participants={participants} stats={stats} />
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
