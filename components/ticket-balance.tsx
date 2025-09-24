"use client";

import React from "react";
import { motion } from "framer-motion";
import { Ticket, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TicketBalanceProps {
  campaignId: string;
  campaignTitle: string;
  ticketBalance: number;
  ticketPrice: number; // Price per ticket in cents
  className?: string;
}

export default function TicketBalance({ 
  campaignId, 
  campaignTitle, 
  ticketBalance, 
  ticketPrice,
  className = ""
}: TicketBalanceProps) {
  const ticketValue = ticketBalance * ticketPrice;

  return (
    <motion.div 
      className={`mb-4 ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
            <Ticket className="h-5 w-5" />
            <span>Your Tickets</span>
            <Badge variant="secondary" className="ml-auto">
              {campaignTitle}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {ticketBalance} Ticket{ticketBalance !== 1 ? 's' : ''}
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300">
                Campaign value: ${(() => {
                  const dollars = ticketValue / 100;
                  return Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2);
                })()}
              </div>
            </div>
            
            {ticketBalance > 0 && (
              <div className="text-right">
                <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">
                  Available for redemption
                </div>
                <div className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300">
                  <Info className="h-3 w-3" />
                  <span>Click items to redeem</span>
                </div>
              </div>
            )}
          </div>
          
          {ticketBalance === 0 && (
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-2 text-center">
              Purchase tickets to redeem campaign items
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
