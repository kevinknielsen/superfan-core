"use client";

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserCheck, 
  QrCode, 
  Unlock, 
  BarChart3, 
  Plus,
  Search,
  Filter,
  MoreVertical,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  CheckCircle,
  AlertCircle,
  Menu,
  X,
  ArrowRight,
  Settings,
  Bell,
  User,
  Shield,
  Gift
} from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/header";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { usePrivy } from "@privy-io/react-auth";
import { cn } from "@/lib/utils";

// Admin Dashboard Components (for detailed views)
import ClubManagement from "@/components/admin/club-management";
import MemberManagement from "@/components/admin/member-management";
import QRManagement from "@/components/admin/qr-management";
import AnalyticsDashboard from "@/components/admin/analytics-dashboard";
import UnlockManagement from "@/components/admin/unlock-management";

interface AdminStats {
  totalClubs: number;
  totalMembers: number;
  totalTapIns: number;
  totalUnlocks: number;
}

interface AdminCard {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color: string;
  component: React.ComponentType<any>;
}

interface ActivityItem {
  id: string;
  type: 'club' | 'member' | 'qr' | 'unlock';
  title: string;
  description: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
}

interface QuickAction {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  action: () => void;
}

export default function AdminDashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useUnifiedAuth();
  const { getAccessToken } = usePrivy();
  const router = useRouter();
  const { toast } = useToast();
  
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [adminStats, setAdminStats] = useState<AdminStats>({
    totalClubs: 0,
    totalMembers: 0,
    totalTapIns: 0,
    totalUnlocks: 0
  });

  const adminCards: AdminCard[] = [
    {
      id: 'clubs',
      title: 'Club Management',
      description: 'Create and manage clubs, events, and memberships',
      icon: Users,
      count: adminStats.totalClubs,
      trend: 'up',
      trendValue: '+12%',
      color: 'bg-blue-500',
      component: ClubManagement
    },
    {
      id: 'members',
      title: 'Member Directory',
      description: 'View and manage member profiles and access',
      icon: UserCheck,
      count: adminStats.totalMembers,
      trend: 'up',
      trendValue: '+8%',
      color: 'bg-green-500',
      component: MemberManagement
    },
    {
      id: 'qr-codes',
      title: 'QR Code System',
      description: 'Generate and track QR codes for events',
      icon: QrCode,
      count: adminStats.totalTapIns,
      trend: 'neutral',
      trendValue: '0%',
      color: 'bg-purple-500',
      component: QRManagement
    },
    {
      id: 'unlocks',
      title: 'Benefits Management',
      description: 'Create and manage member benefits',
      icon: Gift,
      count: adminStats.totalUnlocks,
      trend: 'down',
      trendValue: '-3%',
      color: 'bg-orange-500',
      component: UnlockManagement
    },
  ];

  const recentActivity: ActivityItem[] = [
    {
      id: '1',
      type: 'member',
      title: 'New member registration',
      description: 'New user joined a club',
      timestamp: '2 minutes ago',
      status: 'success'
    },
    {
      id: '2',
      type: 'unlock',
      title: 'Access granted',
      description: 'Unlock redeemed successfully',
      timestamp: '5 minutes ago',
      status: 'success'
    },
    {
      id: '3',
      type: 'qr',
      title: 'QR code scanned',
      description: 'Event check-in completed',
      timestamp: '12 minutes ago',
      status: 'success'
    },
    {
      id: '4',
      type: 'club',
      title: 'Club created',
      description: 'New club added to platform',
      timestamp: '1 hour ago',
      status: 'warning'
    }
  ];

  // Check admin status
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      checkAdminStatus();
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, user, router]);

  const checkAdminStatus = async () => {
    try {
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        throw new Error("User not logged in");
      }

      const response = await fetch('/api/auth/admin-status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      const responseData = await response.json() as { isAdmin?: boolean };
      const userIsAdmin = responseData.isAdmin;
      
      if (userIsAdmin) {
        setIsAdmin(true);
        await loadAdminStats();
      } else {
        setIsAdmin(false);
        toast({
          title: "Access Denied",
          description: "You don't have admin permissions",
          variant: "destructive"
        });
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
      router.push('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAdminStats = async () => {
    try {
      const response = await fetch('/api/admin/stats');
      if (response.ok) {
        const stats = await response.json() as AdminStats;
        setAdminStats(stats);
      }
    } catch (error) {
      console.error('Error loading admin stats:', error);
    }
  };

  const quickActions: QuickAction[] = [
    {
      id: 'add-club',
      title: 'Add New Club',
      icon: Plus,
      color: 'bg-blue-500',
      action: () => setSelectedView('clubs')
    },
    {
      id: 'add-benefit',
      title: 'Add A Benefit',
      icon: Gift,
      color: 'bg-green-500',
      action: () => setSelectedView('unlocks')
    },
    {
      id: 'generate-qr',
      title: 'Generate QR',
      icon: QrCode,
      color: 'bg-purple-500',
      action: () => setSelectedView('qr-codes')
    },
  ];

  const handleCardClick = (cardId: string) => {
    setSelectedView(cardId);
    setIsMobileMenuOpen(false);
  };

  const handleBackToHome = () => {
    setSelectedView(null);
  };

  const getStatusIcon = (status: ActivityItem['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTrendIcon = (trend: AdminCard['trend']) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || isAdmin === false) {
    return null; // Will redirect
  }

  // If a specific view is selected, show that component
  if (selectedView) {
    const selectedCard = adminCards.find(card => card.id === selectedView);
    if (selectedCard) {
      const Component = selectedCard.component;
      return (
        <div className="min-h-screen bg-background">
          <Header />
          
          {/* Mobile Back Header */}
          <div className="lg:hidden bg-card border-b border-border px-4 py-3 flex items-center">
            <button
              onClick={handleBackToHome}
              className="p-2 rounded-lg hover:bg-accent mr-3"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="text-lg font-semibold text-foreground">{selectedCard.title}</h1>
          </div>

          {/* Desktop Back Header */}
          <div className="hidden lg:block bg-card border-b border-border px-6 py-4">
            <div className="flex items-center">
              <button
                onClick={handleBackToHome}
                className="p-2 rounded-lg hover:bg-accent mr-4"
              >
                <ArrowRight className="w-5 h-5 rotate-180 text-foreground" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{selectedCard.title}</h1>
                <p className="text-muted-foreground mt-1">{selectedCard.description}</p>
              </div>
            </div>
          </div>

          <main className="container mx-auto px-4 py-6">
            <Component onStatsUpdate={loadAdminStats} />
          </main>
        </div>
      );
    }
  }

  // Main dashboard view
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Mobile Header */}
      <div className="lg:hidden bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg hover:bg-accent"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5 text-foreground" /> : <Menu className="w-5 h-5 text-foreground" />}
        </button>
        <h1 className="text-lg font-semibold text-foreground">Admin Dashboard</h1>
        <div className="flex items-center space-x-2">
          <button className="p-2 rounded-lg hover:bg-accent">
            <Bell className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Shield className="h-8 w-8 text-primary mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
              <p className="text-muted-foreground mt-1">Manage your platform efficiently</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            <button className="p-2 rounded-lg hover:bg-accent">
              <Bell className="w-5 h-5 text-muted-foreground" />
            </button>
            <button className="p-2 rounded-lg hover:bg-accent">
              <Settings className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-6 space-y-6">
        {/* Quick Actions - Mobile */}
        <div className="lg:hidden">
          <h2 className="text-lg font-semibold text-foreground mb-3">Quick Actions</h2>
          <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={action.action}
                  className="flex-shrink-0 flex flex-col items-center p-4 card hover:bg-card/80 transition-all duration-200 min-w-[100px]"
                >
                  <div className={cn("p-3 rounded-lg mb-2", action.color)}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs font-medium text-foreground text-center">{action.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Admin Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-lg lg:text-xl font-semibold text-foreground mb-4">Administration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
            {adminCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleCardClick(card.id)}
                  className={cn(
                    "card cursor-pointer hover:bg-card/80 hover:scale-[1.02] group"
                  )}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn("p-3 rounded-lg", card.color)}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <button className="p-1 rounded-lg hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground text-lg">{card.title}</h3>
                    <p className="text-muted-foreground text-sm">{card.description}</p>
                    
                    {card.count !== undefined && (
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-2xl font-bold text-foreground">{card.count}</span>
                        {card.trend && card.trendValue && (
                          <div className="flex items-center space-x-1">
                            {getTrendIcon(card.trend)}
                            <span className={cn(
                              "text-sm font-medium",
                              card.trend === 'up' ? "text-green-600" : 
                              card.trend === 'down' ? "text-red-600" : "text-gray-600"
                            )}>
                              {card.trendValue}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <span className="text-sm text-muted-foreground">Manage</span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
            <div className="flex items-center space-x-2">
              <button className="p-2 rounded-lg hover:bg-accent">
                <Filter className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="text-sm text-primary hover:text-primary/80 font-medium">
                View All
              </button>
            </div>
          </div>
          
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
                <div className="flex-shrink-0 mt-1">
                  {getStatusIcon(activity.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm">{activity.title}</p>
                  <p className="text-muted-foreground text-sm">{activity.description}</p>
                </div>
                <div className="flex-shrink-0 flex items-center text-xs text-muted-foreground">
                  <Clock className="w-3 h-3 mr-1" />
                  {activity.timestamp}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Desktop Quick Actions */}
        <div className="hidden lg:block">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={action.action}
                  className="flex items-center p-4 card hover:bg-card/80 transition-all duration-200 group"
                >
                  <div className={cn("p-3 rounded-lg mr-4", action.color)}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <span className="font-medium text-foreground">{action.title}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto group-hover:text-primary transition-colors" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}