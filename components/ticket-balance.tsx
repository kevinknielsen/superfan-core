"use client";

import React from "react";
import { motion } from "framer-motion";
import { DollarSign, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CreditBalanceProps {
  campaignTitle: string;
  creditBalance: number; // 1 credit = $1
  className?: string;
}

export default function CreditBalance({ 
  campaignTitle, 
  creditBalance,
  className = ""
}: CreditBalanceProps) {
  // 1 credit = $1, so value is just the balance
  const creditValue = creditBalance;

  return (
    <motion.div 
      className={`mb-4 ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
            <DollarSign className="h-5 w-5" />
            <span>Your Credits</span>
            <Badge variant="secondary" className="ml-auto">
              {campaignTitle}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {creditBalance} Credit{creditBalance !== 1 ? 's' : ''}
              </div>
              <div className="text-sm text-green-700 dark:text-green-300">
                = ${creditValue}.00 campaign value
              </div>
            </div>
            
            {creditBalance > 0 && (
              <div className="text-right">
                <div className="text-xs text-green-600 dark:text-green-400 mb-1">
                  Available for redemption
                </div>
                <div className="flex items-center gap-1 text-xs text-green-700 dark:text-green-300">
                  <Info className="h-3 w-3" />
                  <span>Click items to redeem</span>
                </div>
              </div>
            )}
          </div>
          
          {creditBalance === 0 && (
            <div className="text-xs text-green-600 dark:text-green-400 mt-2 text-center">
              Purchase credits to redeem campaign items
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
