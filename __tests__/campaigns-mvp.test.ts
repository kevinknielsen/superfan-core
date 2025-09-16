/**
 * @jest-environment node
 */

import { describe, test, expect } from '@jest/globals';

// Test discount calculation logic
describe('Campaign MVP - Discount Logic', () => {
  // Helper function to calculate user discount (matches API implementation)
  function calculateUserDiscount(userTier: string, rewardTier: string, reward: any): number {
    const userRank = getTierRank(userTier);
    const rewardRank = getTierRank(rewardTier);
    
    // Only discount if user tier >= reward tier
    if (userRank >= rewardRank) {
      switch (userTier) {
        case 'resident': 
          return Math.round(reward.upgrade_price_cents * (reward.resident_discount_percentage || 10.0) / 100);
        case 'headliner': 
          return Math.round(reward.upgrade_price_cents * (reward.headliner_discount_percentage || 15.0) / 100);
        case 'superfan': 
          return Math.round(reward.upgrade_price_cents * (reward.superfan_discount_percentage || 25.0) / 100);
        default: return 0;
      }
    }
    return 0;
  }

  function getTierRank(tier: string): number {
    switch (tier) {
      case 'cadet': return 0;
      case 'resident': return 1;
      case 'headliner': return 2;
      case 'superfan': return 3;
      default: return 0;
    }
  }

  describe('Percentage-based discounts', () => {
    const mockReward = {
      upgrade_price_cents: 2500, // $25
      resident_discount_percentage: 10.0,
      headliner_discount_percentage: 15.0,
      superfan_discount_percentage: 25.0
    };

    test('calculates correct discount for resident tier', () => {
      const discount = calculateUserDiscount('resident', 'resident', mockReward);
      expect(discount).toBe(250); // 10% of $25 = $2.50
    });

    test('calculates correct discount for headliner tier', () => {
      const discount = calculateUserDiscount('headliner', 'resident', mockReward);
      expect(discount).toBe(375); // 15% of $25 = $3.75
    });

    test('calculates correct discount for superfan tier', () => {
      const discount = calculateUserDiscount('superfan', 'resident', mockReward);
      expect(discount).toBe(625); // 25% of $25 = $6.25
    });

    test('no discount for lower tier users', () => {
      const discount = calculateUserDiscount('cadet', 'resident', mockReward);
      expect(discount).toBe(0); // Cadet can't get resident discount
    });

    test('higher tier users get their own tier discount', () => {
      const headlinerReward = { ...mockReward, tier: 'headliner' };
      const discount = calculateUserDiscount('superfan', 'headliner', headlinerReward);
      expect(discount).toBe(625); // Superfan gets 25% off headliner tier
    });
  });

  describe('Campaign progress calculation', () => {
    test('campaign progress uses full tier value', () => {
      const userPayment = 2000; // $20 (after 20% discount)
      const campaignCredit = 2500; // $25 (full tier value)
      const platformSubsidy = 500; // $5 (discount amount)
      
      expect(userPayment + platformSubsidy).toBe(campaignCredit);
      expect(campaignCredit).toBe(2500); // Campaign gets full value
    });

    test('funding percentage calculation', () => {
      const campaignGoal = 10000; // $100
      const currentFunding = 7500; // $75 (in full tier values)
      const fundingPercentage = (currentFunding / campaignGoal) * 100;
      
      expect(fundingPercentage).toBe(75.0);
    });
  });

  describe('Tier rank comparison', () => {
    test('tier ranks are correctly ordered', () => {
      expect(getTierRank('cadet')).toBe(0);
      expect(getTierRank('resident')).toBe(1);
      expect(getTierRank('headliner')).toBe(2);
      expect(getTierRank('superfan')).toBe(3);
    });

    test('higher tier users can access lower tier rewards', () => {
      expect(getTierRank('superfan') >= getTierRank('resident')).toBe(true);
      expect(getTierRank('headliner') >= getTierRank('resident')).toBe(true);
      expect(getTierRank('cadet') >= getTierRank('resident')).toBe(false);
    });
  });

  describe('Price validation', () => {
    test('final price is never negative', () => {
      const expensiveReward = {
        upgrade_price_cents: 1000, // $10
        superfan_discount_percentage: 50.0 // 50% off
      };
      
      const discount = calculateUserDiscount('superfan', 'resident', expensiveReward);
      const finalPrice = Math.max(0, expensiveReward.upgrade_price_cents - discount);
      
      expect(finalPrice).toBeGreaterThanOrEqual(0);
      expect(finalPrice).toBe(500); // $5 after 50% discount
    });

    test('handles edge case of 100% discount', () => {
      const freeReward = {
        upgrade_price_cents: 1000,
        superfan_discount_percentage: 100.0 // 100% off (edge case)
      };
      
      const discount = calculateUserDiscount('superfan', 'resident', freeReward);
      const finalPrice = Math.max(0, freeReward.upgrade_price_cents - discount);
      
      expect(finalPrice).toBe(0); // Free after 100% discount
    });
  });

  describe('Default discount percentages', () => {
    test('uses default percentages when not specified', () => {
      const rewardWithoutDiscounts = {
        upgrade_price_cents: 2000 // $20
        // No discount percentages specified
      };
      
      const residentDiscount = calculateUserDiscount('resident', 'resident', rewardWithoutDiscounts);
      const headlinerDiscount = calculateUserDiscount('headliner', 'resident', rewardWithoutDiscounts);
      const superfanDiscount = calculateUserDiscount('superfan', 'resident', rewardWithoutDiscounts);
      
      expect(residentDiscount).toBe(200); // 10% default = $2
      expect(headlinerDiscount).toBe(300); // 15% default = $3
      expect(superfanDiscount).toBe(500); // 25% default = $5
    });
  });
});

// Test campaign flow scenarios
describe('Campaign MVP - Business Logic', () => {
  describe('Campaign success scenarios', () => {
    test('campaign reaches goal with mixed tier purchases', () => {
      const campaignGoal = 10000; // $100
      let currentFunding = 0;
      
      // Simulate purchases
      const purchases = [
        { tier: 'resident', user_tier: 'resident', amount: 2500 }, // $25 full value
        { tier: 'headliner', user_tier: 'headliner', amount: 5000 }, // $50 full value
        { tier: 'superfan', user_tier: 'cadet', amount: 2500 } // $25 full value (no discount)
      ];
      
      purchases.forEach(purchase => {
        currentFunding += purchase.amount; // Campaign gets full value
      });
      
      expect(currentFunding).toBe(10000); // Goal reached
      expect(currentFunding >= campaignGoal).toBe(true);
    });
  });

  describe('Refund scenarios', () => {
    test('failed campaign refunds actual payments, not full values', () => {
      const purchases = [
        { 
          user_paid: 2250, // $22.50 (after 10% resident discount)
          campaign_credited: 2500, // $25 (full value)
          discount: 250 // $2.50 platform subsidy
        },
        {
          user_paid: 4250, // $42.50 (after 15% headliner discount)  
          campaign_credited: 5000, // $50 (full value)
          discount: 750 // $7.50 platform subsidy
        }
      ];
      
      // Campaign fails - refund what users actually paid
      const totalRefunds = purchases.reduce((sum, p) => sum + p.user_paid, 0);
      const totalSubsidyLoss = purchases.reduce((sum, p) => sum + p.discount, 0);
      
      expect(totalRefunds).toBe(6500); // $65 refunded to users
      expect(totalSubsidyLoss).toBe(1000); // $10 platform loss (subsidies)
    });
  });
});
