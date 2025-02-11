import { useState } from 'react';

interface GroupSelectionFormProps {
  onSubmit: (data: {
    sourceGroups: string[];
    targetGroup: string;
    delaySeconds: number;
  }) => void;
  disabled?: boolean;
}

export default function GroupSelectionForm({ onSubmit, disabled }: GroupSelectionFormProps) {
  const [sourceGroups, setSourceGroups] = useState<string>('');
  const [targetGroup, setTargetGroup] = useState<string>('');
  const [delaySeconds, setDelaySeconds] = useState<number>(60); // Default 1 minute

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Split source groups by newline and filter empty lines
    const sourceGroupList = sourceGroups
      .split('\n')
      .map(link => link.trim())
      .filter(link => link.length > 0);

    onSubmit({
      sourceGroups: sourceGroupList,
      targetGroup: targetGroup.trim(),
      delaySeconds: delaySeconds
    });
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="sourceGroups" className="block text-sm font-medium text-gray-700">
            Source Groups (one link per line)
          </label>
          <textarea
            id="sourceGroups"
            value={sourceGroups}
            onChange={(e) => setSourceGroups(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="https://t.me/group1                                           https://t.me/group2"
            rows={5}
            required
          />
        </div>

        <div>
          <label htmlFor="targetGroup" className="block text-sm font-medium text-gray-700">
            Target Group
          </label>
          <input
            type="text"
            id="targetGroup"
            value={targetGroup}
            onChange={(e) => setTargetGroup(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="https://t.me/targetgroup"
            required
          />
        </div>

        <div>
          <label htmlFor="delaySeconds" className="block text-sm font-medium text-gray-700">
            Delay Between Invites (seconds)
          </label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <input
              type="number"
              id="delaySeconds"
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              required
            />
            <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
              seconds
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Recommended: 60-180 seconds to avoid rate limits
          </p>
        </div>

        <button
          type="submit"
          disabled={disabled}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            disabled 
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
          }`}
        >
          {disabled ? 'Processing...' : 'Start Inviting Members'}
        </button>
      </form>
    </div>
  );
} 