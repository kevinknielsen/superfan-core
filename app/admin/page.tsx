"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Users, 
  Settings, 
  BarChart3, 
  QrCode, 
  Shield, 
  Gift,
  TrendingUp,
  Crown,
  Star,
  Zap
} from "lucide-react";
import Header from "@/components/header";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Admin Dashboard Components
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

export default function AdminDashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useUnifiedAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [adminStats, setAdminStats] = useState<AdminStats>({
    totalClubs: 0,
    totalMembers: 0,
    totalTapIns: 0,
    totalUnlocks: 0
  });

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
      // Use the API endpoint to check admin status (works on both local and remote)
      const response = await fetch('/api/auth/admin-status');
      const { isAdmin: userIsAdmin } = await response.json();
      
      console.log('[Admin Check] API Response:', {
        userId: user?.id,
        isAdmin: userIsAdmin,
        status: response.status
      });
      
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
        const stats = await response.json();
        setAdminStats(stats);
      }
    } catch (error) {
      console.error('Error loading admin stats:', error);
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center mb-2">
            <Shield className="h-8 w-8 text-primary mr-3" />
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          </div>
          <p className="text-muted-foreground">
            Manage clubs, members, and platform features
          </p>
        </motion.div>

        {/* Stats Overview */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clubs</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminStats.totalClubs.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Active communities</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Members</CardTitle>
              <Crown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminStats.totalMembers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across all clubs</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tap-ins</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminStats.totalTapIns.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">All-time engagements</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Unlocks</CardTitle>
              <Gift className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminStats.totalUnlocks.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Available perks</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Tabs defaultValue="clubs" className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-8">
              <TabsTrigger value="clubs" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Clubs
              </TabsTrigger>
              <TabsTrigger value="members" className="flex items-center gap-2">
                <Crown className="h-4 w-4" />
                Members
              </TabsTrigger>
              <TabsTrigger value="qr" className="flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                QR Codes
              </TabsTrigger>
              <TabsTrigger value="unlocks" className="flex items-center gap-2">
                <Gift className="h-4 w-4" />
                Unlocks
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="clubs">
              <ClubManagement onStatsUpdate={loadAdminStats} />
            </TabsContent>

            <TabsContent value="members">
              <MemberManagement onStatsUpdate={loadAdminStats} />
            </TabsContent>

            <TabsContent value="qr">
              <QRManagement />
            </TabsContent>

            <TabsContent value="unlocks">
              <UnlockManagement onStatsUpdate={loadAdminStats} />
            </TabsContent>

            <TabsContent value="analytics">
              <AnalyticsDashboard stats={adminStats} />
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
}
