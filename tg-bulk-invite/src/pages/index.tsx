import Head from "next/head";
import { useState, useRef, useEffect } from "react";
import TelegramLoginForm from "@/components/TelegramLoginForm";
import VerificationCodeForm from "@/components/VerificationCodeForm";
import { telegramService } from "@/services/telegramService";
import GroupSelectionForm from "@/components/GroupSelectionForm";
import InviteProgress from "@/components/InviteProgress";
import { useInvitedUsers } from '@/hooks/useInvitedUsers';
import PhoneNumberInviteForm from "@/components/PhoneNumberInviteForm";

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
  const [activeForm, setActiveForm] = useState<'group' | 'phone'>('group');

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
        message: (error as Error).message, 
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
        message: (error as Error).message, 
        type: 'error' 
      });
    }
  };

  const handleGroupSelection = async (data: {
    sourceGroups: string[];
    targetGroup: string;
    delayRange: { min: number; max: number };
    maxPerGroup: number;
    maxMessages: number;
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
        previouslyInvited: invitedUsers,
        maxPerGroup: data.maxPerGroup,
        delayRange: data.delayRange,
        maxMessages: data.maxMessages
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

          // Wait for a random delay within the range
          const delayMs = Math.floor(Math.random() * (data.delayRange.max - data.delayRange.min + 1) + data.delayRange.min) * 1000;
          await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(resolve, delayMs);
            
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

          // Wait for a random delay before next attempt
          const delayMs = Math.floor(Math.random() * (data.delayRange.max - data.delayRange.min + 1) + data.delayRange.min) * 1000;
          await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(resolve, delayMs);
            
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
        message: (error as Error).message, 
        type: 'error' 
      });
    } finally {
      setIsProcessing(false);
      stopRef.current = false;
      setShouldStop(false);
    }
  };

  const handleBackgroundInvite = async (data: {
    sourceGroups: string[];
    targetGroup: string;
    delayRange: { min: number; max: number };
    maxPerGroup: number;
    maxMessages: number;
  }) => {
    try {
      setIsProcessing(true);
      setCurrentTargetGroup(data.targetGroup);
      setStatus({ message: 'Getting eligible participants...', type: 'info' });
      
      const result = await telegramService.getParticipants({
        sourceGroups: data.sourceGroups,
        targetGroup: data.targetGroup,
        sessionId: sessionId,
        previouslyInvited: invitedUsers,
        maxPerGroup: data.maxPerGroup,
        delayRange: data.delayRange,
        maxMessages: data.maxMessages
      });

      result.participants.forEach(participant => {
        addInvitedUser({ id: participant.id }, data.targetGroup);
      });
      
      // Start background invite process
      telegramService.startBackgroundInvite({
        sessionId,
        delayRange: data.delayRange,
        participants: result.participants
      });

      setStatus({ 
        message: 'Background invite process started. You can close this window.', 
        type: 'success' 
      });
    } catch (error) {
      setStatus({ 
        message: (error as Error).message, 
        type: 'error' 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStop = () => {
    stopRef.current = true;
    setShouldStop(true);
    setStatus({ message: 'Stopping process...', type: 'info' });
  };

  const handlePhoneNumberInvite = async (data: {
    phoneNumbers: string[];
    targetGroup: string;
    delayRange: { min: number; max: number };
  }) => {
    try {
      setIsProcessing(true);
      setCurrentTargetGroup(data.targetGroup);
      setStatus({ message: 'Processing phone numbers...', type: 'info' });
      
      const result = await telegramService.inviteByPhoneNumbers({
        sessionId,
        phoneNumbers: data.phoneNumbers,
        targetGroup: data.targetGroup,
        delayRange: data.delayRange
      });

      setStatus({ 
        message: result.message, 
        type: 'success' 
      });
    } catch (error) {
      setStatus({ 
        message: (error as Error).message, 
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
                <div className="mb-6">
                  <div className="sm:hidden">
                    <select
                      id="tabs"
                      name="tabs"
                      className="block w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                      value={activeForm}
                      onChange={(e) => setActiveForm(e.target.value as 'group' | 'phone')}
                    >
                      <option value="group">Invite from Groups</option>
                      <option value="phone">Invite by Phone Numbers</option>
                    </select>
                  </div>
                  <div className="hidden sm:block">
                    <div className="border-b border-gray-200">
                      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                          onClick={() => setActiveForm('group')}
                          className={`${
                            activeForm === 'group'
                              ? 'border-indigo-500 text-indigo-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                          Invite from Groups
                        </button>
                        <button
                          onClick={() => setActiveForm('phone')}
                          className={`${
                            activeForm === 'phone'
                              ? 'border-indigo-500 text-indigo-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                          Invite by Phone Numbers
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>

                {activeForm === 'group' ? (
                  <GroupSelectionForm 
                    onSubmit={handleGroupSelection} 
                    onBackgroundSubmit={handleBackgroundInvite}
                    disabled={isProcessing}
                  />
                ) : (
                  <PhoneNumberInviteForm
                    onSubmit={handlePhoneNumberInvite}
                    disabled={isProcessing}
                  />
                )}
                
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
