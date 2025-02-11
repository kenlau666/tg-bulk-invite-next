import React from 'react';

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

interface InviteProgressProps {
  participants: Participant[];
  stats: Stats;
}

export default function InviteProgress({ participants, stats }: InviteProgressProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'invited':
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
            Invited
          </span>
        );
      case 'skipped':
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
            Skipped
          </span>
        );
      default:
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="mt-6 bg-white rounded-lg shadow-md p-6">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-gray-900">Invitation Progress</h3>
        <div className="mt-2 grid grid-cols-3 gap-4 text-center">
          <div className="bg-gray-50 rounded-md p-3">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-500">Total Found</div>
          </div>
          <div className="bg-green-50 rounded-md p-3">
            <div className="text-2xl font-bold text-green-600">{stats.invited}</div>
            <div className="text-sm text-green-500">Invited</div>
          </div>
          <div className="bg-yellow-50 rounded-md p-3">
            <div className="text-2xl font-bold text-yellow-600">{stats.skipped}</div>
            <div className="text-sm text-yellow-500">Skipped</div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Participants</h4>
        <div className="max-h-60 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {participants.map((participant) => (
                <tr key={participant.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {participant.firstName || 'Unknown User'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {participant.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getStatusBadge(participant.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 