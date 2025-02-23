import { useState } from 'react';

interface GroupSelectionFormProps {
  onSubmit: (data: {
    sourceGroups: string[];
    targetGroup: string;
    delayRange: {
      min: number;
      max: number;
    };
    maxPerGroup: number;
    maxMessages: number;
  }) => void;
  onBackgroundSubmit: (data: {
    sourceGroups: string[];
    targetGroup: string;
    delayRange: {
      min: number;
      max: number;
    };
    maxPerGroup: number;
    maxMessages: number;
  }) => void;
  disabled?: boolean;
}

export default function GroupSelectionForm({ onSubmit, onBackgroundSubmit, disabled }: GroupSelectionFormProps) {
  const [sourceGroups, setSourceGroups] = useState<string>('');
  const [targetGroup, setTargetGroup] = useState<string>('');
  const [maxPerGroup, setMaxPerGroup] = useState<number>(0); // 0 means no limit
  const [delayRange, setDelayRange] = useState({
    min: 60,
    max: 60
  });
  const [maxMessages, setMaxMessages] = useState<number>(3000);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sourceGroupList = sourceGroups
      .split('\n')
      .map(link => link.trim())
      .filter(link => link.length > 0);

    onSubmit({
      sourceGroups: sourceGroupList,
      targetGroup: targetGroup.trim(),
      delayRange,
      maxPerGroup,
      maxMessages
    });
  };

  const handleBackgroundSubmit = () => {
    const sourceGroupList = sourceGroups
      .split('\n')
      .map(link => link.trim())
      .filter(link => link.length > 0);

    onBackgroundSubmit({
      sourceGroups: sourceGroupList,
      targetGroup: targetGroup.trim(),
      delayRange,
      maxPerGroup,
      maxMessages
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
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium text-gray-700"
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
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium text-gray-700"
            placeholder="https://t.me/targetgroup"
            required
          />
        </div>

        <div>
          <label htmlFor="maxPerGroup" className="block text-sm font-medium text-gray-700">
            Max Members per Source Group (0 for no limit)
          </label>
          <input
            type="number"
            id="maxPerGroup"
            value={maxPerGroup}
            onChange={(e) => setMaxPerGroup(Math.max(0, parseInt(e.target.value) || 0))}
            min="0"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium text-gray-700"
          />
        </div>

        <div>
          <label htmlFor="delayRange" className="block text-sm font-medium text-gray-700">
            Delay Range (seconds)
          </label>
          <div className="mt-1 grid grid-cols-2 gap-4">
            <div className="flex rounded-md shadow-sm">
              <input
                type="number"
                id="delayMin"
                value={delayRange.min}
                onChange={(e) => setDelayRange(prev => ({
                  ...prev,
                  min: Math.max(1, parseInt(e.target.value) || 1)
                }))}
                min="1"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium text-gray-700"
                placeholder="Min"
                required
              />
            </div>
            <div className="flex rounded-md shadow-sm">
              <input
                type="number"
                id="delayMax"
                value={delayRange.max}
                onChange={(e) => setDelayRange(prev => ({
                  ...prev,
                  max: Math.max(prev.min, parseInt(e.target.value) || prev.min)
                }))}
                min={delayRange.min}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium text-gray-700"
                placeholder="Max"
                required
              />
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Recommended: 60-180 seconds to avoid rate limits
          </p>
        </div>

        <div>
          <label htmlFor="maxMessages" className="block text-sm font-medium text-gray-700">
            Max Messages to Scan
          </label>
          <input
            type="number"
            id="maxMessages"
            value={maxMessages}
            onChange={(e) => setMaxMessages(Math.max(1, parseInt(e.target.value) || 1))}
            min="1"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium text-gray-700"
          />
          <p className="mt-1 text-sm text-gray-500">
            Higher values will find more members but take longer to process
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="submit"
            disabled={disabled}
            className={`flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              disabled 
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
            }`}
          >
            {disabled ? 'Processing...' : 'Start Interactive Invite'}
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={handleBackgroundSubmit}
            className={`flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              disabled 
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
            }`}
          >
            {disabled ? 'Processing...' : 'Start Background Invite'}
          </button>
        </div>
      </form>
    </div>
  );
} 