import { Home, BarChart2, Settings, Upload, PieChart, MessageCircle, Bot } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';

const navigation = [
  { name: 'Dashboard', icon: Home, href: '/dashboard' },
  { name: 'Import', icon: Upload, href: '/upload' },
  { name: 'RFM Matrix', icon: PieChart, href: '/matriz-rfm' },
  { name: 'Delivery Guru', icon: Bot, href: '/guru' },
  { name: 'WhatsApp', icon: MessageCircle, href: '/whatsapp' },
  { name: 'Settings', icon: Settings, href: '/settings' },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const location = useLocation();

  return (
    <div className={clsx('w-16 bg-white border-r border-gray-200 flex flex-col', className)}>
      <div className="flex-1 flex flex-col items-center pt-5 pb-4 space-y-4">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          
          return (
            <Link
              key={item.name}
              to={item.href}
              className={clsx(
                'p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-50 rounded-xl transition-colors duration-200',
                isActive && 'text-blue-600 bg-blue-50'
              )}
              title={item.name}
            >
              <item.icon className="h-6 w-6" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}