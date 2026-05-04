'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export default function Toast({ message, type, onClose, duration = 4000, action }: ToastProps) {
  useEffect(() => {
    // Slightly longer duration when there's an action button so users can react
    const timer = setTimeout(onClose, action ? duration + 2000 : duration);
    return () => clearTimeout(timer);
  }, [onClose, duration, action]);

  return (
    <div className="fixed bottom-4 right-4 z-50 toast">
      <div className={`
        flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg
        ${type === 'success'
          ? 'bg-green-50 border border-green-200 text-green-800'
          : 'bg-red-50 border border-red-200 text-red-800'
        }
      `}>
        {type === 'success' ? (
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
        )}
        <p className="font-medium">{message}</p>
        {action && (
          <button
            onClick={action.onClick}
            className={`px-3 py-1 text-sm font-semibold rounded-lg transition-colors ${
              type === 'success'
                ? 'text-green-700 hover:bg-green-100'
                : 'text-red-700 hover:bg-red-100'
            }`}
          >
            {action.label}
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 hover:bg-black/5 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
