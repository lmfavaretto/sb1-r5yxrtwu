import { ReactNode } from 'react';
import { Card } from '../ui/Card';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
}

export function AuthLayout({ children, title }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-gray-900 text-center mb-8">{title}</h1>
        {children}
      </Card>
    </div>
  );
}