import Head from "next/head";
import { useState, useRef } from "react";
import TelegramLoginForm from "@/components/TelegramLoginForm";
import VerificationCodeForm from "@/components/VerificationCodeForm";
import { telegramService } from "@/services/telegramService";
import GroupSelectionForm from "@/components/GroupSelectionForm";
import InviteProgress from "@/components/InviteProgress";
import { useInvitedUsers } from '@/hooks/useInvitedUsers';

interface Participant {
  id: number;
  firstName: string | null;
  status: 'invited' | 'skipped' | 'pending' | 'failed';
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
  const [currentTargetGroup, setCurrentTargetGroup] = useState<string | null>(null);
  const { invitedUsers, addInvitedUser, isUserInvited } = useInvitedUsers(currentTargetGroup);
  const [shouldStop, setShouldStop] = useState(false);
  const stopRef = useRef(false);

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
    delaySeconds: number;
  }) => {
    try {
      setIsProcessing(true);
      stopRef.current = false;
      setCurrentTargetGroup(data.targetGroup);
      setStatus({ message: 'Getting eligible participants...', type: 'info' });
      
      const result = await telegramService.getParticipants({
        sourceGroups: data.sourceGroups,
        targetGroup: data.targetGroup,
        sessionId: sessionId,
        previouslyInvited: invitedUsers.filter(u => u.groupId === data.targetGroup)  // Send all invited users
      });

      setParticipants(result.participants.map((p: Participant) => ({ 
        ...p,
        status: 'pending',
        firstName: p.firstName || '',
        id: Number(p.id)
      })));
      setStats({ total: result.participants.length, invited: 0, skipped: 0 });

      // Then, invite them one by one with delay
      for (const participant of result.participants) {
        if (stopRef.current) {
          setStatus({ message: 'Process stopped by user', type: 'info' });
          break;
        }

        try {
          await telegramService.inviteParticipant({
            sessionId,
            participant
          });

          // Update participant status and stats
          setParticipants(prev => prev.map(p => 
            p.id === participant.id ? { ...p, status: 'invited' } : p
          ));
          setStats(prev => ({ ...prev, invited: prev.invited + 1 }));
          addInvitedUser({ id: participant.id }, data.targetGroup);

          if (stopRef.current) break;

          // Wait for the specified delay
          await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(resolve, data.delaySeconds * 1000);
            
            if (stopRef.current) {
              clearTimeout(timeoutId);
              reject(new Error('Stopped by user'));
            }
          });

        } catch (error) {
          if (error instanceof Error && error.message === 'Stopped by user') {
            break;
          }
          console.error('Failed to invite participant:', error);
          setParticipants(prev => prev.map(p => 
            p.id === participant.id ? { ...p, status: 'failed' } : p
          ));
          setStats(prev => ({ ...prev, skipped: prev.skipped + 1 }));
          addInvitedUser({ id: participant.id }, data.targetGroup);

          await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, data.delaySeconds * 1000);
          
          if (stopRef.current) {
            clearTimeout(timeoutId);
            reject(new Error('Stopped by user'));
          }
          });
        }
      }

      if (!stopRef.current) {
        setStatus({ message: 'Process completed', type: 'success' });
      }
    } catch (error) {
      setStatus({ 
        message: error instanceof Error ? error.message : 'An error occurred', 
        type: 'error' 
      });
    } finally {
      setIsProcessing(false);
      stopRef.current = false;
      setShouldStop(false);
    }
  };

  const handleStop = () => {
    stopRef.current = true;
    setShouldStop(true);
    setStatus({ message: 'Stopping process...', type: 'info' });
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
                  <div className="mt-4 flex flex-col items-center space-y-4">
                    <div className="text-center text-sm text-gray-500">
                      Processing... This may take a while.
                    </div>
                    <button
                      onClick={handleStop}
                      disabled={shouldStop}
                      className={`px-4 py-2 rounded-md text-sm font-medium text-white ${
                        shouldStop 
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500'
                      }`}
                    >
                      {shouldStop ? 'Stopping...' : 'Stop Process'}
                    </button>
                  </div>
                )}
                {participants.length > 0 && (
                  <InviteProgress participants={participants as any} stats={stats} />
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
