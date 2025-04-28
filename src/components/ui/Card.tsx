import { ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={clsx('bg-white rounded-3xl shadow-md p-6', className)}>
      {children}
    </div>
  );
}

interface KPICardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function KPICard({ title, value, icon, subtitle, trend }: KPICardProps) {
  return (
    <Card className="h-full">
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-700">{title}</h3>
          <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
            {icon}
          </div>
        </div>
        <div className="flex-1">
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
          )}
          {trend && (
            <div className={clsx(
              'mt-2 inline-flex items-center text-sm font-medium',
              trend.isPositive ? 'text-green-600' : 'text-red-600'
            )}>
              <span className="mr-1">{trend.isPositive ? '↑' : '↓'}</span>
              {Math.abs(trend.value)}%
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}