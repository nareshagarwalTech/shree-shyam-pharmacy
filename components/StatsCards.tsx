'use client';

import { AlertTriangle, Clock, Calendar, Users } from 'lucide-react';

interface StatsCardsProps {
  stats: {
    overdue: number;
    urgent: number;
    soon: number;
    total: number;
  };
  onFilterClick: (status: 'all' | 'overdue' | 'urgent' | 'soon') => void;
  activeFilter: string;
}

export default function StatsCards({ stats, onFilterClick, activeFilter }: StatsCardsProps) {
  const cards = [
    {
      key: 'overdue',
      label: 'Overdue',
      value: stats.overdue,
      icon: AlertTriangle,
      color: 'from-red-500 to-red-600',
      bgColor: 'bg-red-50',
      textColor: 'text-red-700',
      borderColor: 'border-red-200',
      hoverBg: 'hover:bg-red-100',
    },
    {
      key: 'urgent',
      label: 'Urgent (3 days)',
      value: stats.urgent,
      icon: Clock,
      color: 'from-amber-500 to-amber-600',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
      borderColor: 'border-amber-200',
      hoverBg: 'hover:bg-amber-100',
    },
    {
      key: 'soon',
      label: 'Due Soon (7 days)',
      value: stats.soon,
      icon: Calendar,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
      hoverBg: 'hover:bg-blue-100',
    },
    {
      key: 'all',
      label: 'Total Customers',
      value: stats.total,
      icon: Users,
      color: 'from-gray-500 to-gray-600',
      bgColor: 'bg-gray-50',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-200',
      hoverBg: 'hover:bg-gray-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = activeFilter === card.key;
        
        return (
          <button
            key={card.key}
            onClick={() => onFilterClick(card.key as any)}
            className={`
              relative overflow-hidden rounded-xl border p-4 text-left transition-all
              ${card.bgColor} ${card.borderColor} ${card.hoverBg}
              ${isActive ? 'ring-2 ring-primary-500 ring-offset-2' : ''}
            `}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${card.textColor} opacity-80`}>
                  {card.label}
                </p>
                <p className={`text-3xl font-display font-bold mt-1 ${card.textColor}`}>
                  {card.value}
                </p>
              </div>
              <div className={`p-2 rounded-lg bg-gradient-to-br ${card.color} shadow-sm`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
            </div>
            
            {/* Active indicator */}
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary-500"></div>
            )}
          </button>
        );
      })}
    </div>
  );
}
