import { useState } from 'react';

interface PhoneNumberInviteFormProps {
  onSubmit: (data: {
    phoneNumbers: string[];
    targetGroup: string;
    delayRange: {
      min: number;
      max: number;
    };
  }) => void;
  onInteractiveSubmit: (data: {
    phoneNumbers: string[];
    targetGroup: string;
    delayRange: {
      min: number;
      max: number;
    };
  }) => void;
  disabled?: boolean;
}

export default function PhoneNumberInviteForm({ onSubmit, onInteractiveSubmit, disabled }: PhoneNumberInviteFormProps) {
  const [phoneNumbers, setPhoneNumbers] = useState<string>('');
  const [targetGroup, setTargetGroup] = useState<string>('');
  const [delayRange, setDelayRange] = useState({
    min: 60,
    max: 60
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phoneNumberList = phoneNumbers
      .split(',')
      .map(phone => phone.trim())
      .filter(phone => phone.length > 0);

    onSubmit({
      phoneNumbers: phoneNumberList,
      targetGroup: targetGroup.trim(),
      delayRange
    });
  };

  const handleInteractiveSubmit = () => {
    const phoneNumberList = phoneNumbers
      .split(',')
      .map(phone => phone.trim())
      .filter(phone => phone.length > 0);

    onInteractiveSubmit({
      phoneNumbers: phoneNumberList,
      targetGroup: targetGroup.trim(),
      delayRange
    });
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="phoneNumbers" className="block text-sm font-medium text-gray-700">
            Phone Numbers (comma separated)
          </label>
          <textarea
            id="phoneNumbers"
            value={phoneNumbers}
            onChange={(e) => setPhoneNumbers(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium text-gray-700"
            placeholder="+1234567890, +9876543210"
            rows={5}
            required
          />
          <p className="mt-1 text-sm text-gray-500">
            Enter phone numbers with country code (e.g., +1234567890)
          </p>
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

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            disabled={disabled}
            onClick={handleInteractiveSubmit}
            className={`flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              disabled 
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
            }`}
          >
            {disabled ? 'Processing...' : 'Start Interactive Invite'}
          </button>

          <button
            type="submit"
            disabled={disabled}
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