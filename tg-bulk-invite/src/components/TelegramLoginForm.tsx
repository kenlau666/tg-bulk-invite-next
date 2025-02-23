import { useState } from 'react';

interface TelegramLoginFormProps {
  onSubmit: (data: {
    apiId: string;
    apiHash: string;
    phoneNumber: string;
  }) => void;
}

export default function TelegramLoginForm({ onSubmit }: TelegramLoginFormProps) {
  const [formData, setFormData] = useState({
    apiId: '',
    apiHash: '',
    phoneNumber: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="apiId" className="block text-sm font-medium text-gray-700">
            API ID
          </label>
          <input
            type="text"
            name="apiId"
            id="apiId"
            value={formData.apiId}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium text-gray-700"
            placeholder="Enter your API ID"
            required
          />
        </div>

        <div>
          <label htmlFor="apiHash" className="block text-sm font-medium text-gray-700">
            API Hash
          </label>
          <input
            type="text"
            name="apiHash"
            id="apiHash"
            value={formData.apiHash}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium text-gray-700"
            placeholder="Enter your API Hash"
            required
          />
        </div>

        <div>
          <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
            Phone Number
          </label>
          <input
            type="tel"
            name="phoneNumber"
            id="phoneNumber"
            value={formData.phoneNumber}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-medium text-gray-700"
            placeholder="+1234567890"
            required
          />
        </div>

        <div>
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Connect to Telegram
          </button>
        </div>
      </form>
    </div>
  );
} 