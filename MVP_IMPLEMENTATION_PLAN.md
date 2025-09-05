# Superfan MVP Implementation Plan
## 2-Week Sprint to Clean, Working Product

**Target**: Ship the original memo vision with unified points system
**Timeline**: 2 weeks  
**Focus**: Clean, simple, working product for Billfold partnership

---

## 🎯 **What We're Building**

The **original superfan-core-memo.md vision** with modern unified points:

- **Clubs** - Artist/label communities (free to join)
- **Tap-ins** - QR code scanning earns points  
- **Status** - Cadet → Resident → Headliner → Superfan progression
- **Unlocks** - Spend points on perks (presales, line-skip, vinyl, studio visits)
- **Points** - Unified currency (earned + purchased, $1 = 100 points)

**Key Partnership**: Billfold users can scan QRs and earn points seamlessly

---

## 🧹 **System Cleanup (Week 1)**

### **Current Problem**: Too Many Overlapping Systems
We have 3 different points systems, duplicate tables, and confusing admin access.

### **Clean Schema** (Keep Only These Tables)
```sql
-- CORE TABLES (KEEP)
users                 ✅ Add role column
clubs                 ✅ Keep unified pricing
club_memberships      ✅ Simple membership
point_wallets         ✅ Unified points system  
point_transactions    ✅ Purchase/earn history
tap_ins               ✅ QR scanning records
unlocks               ✅ Perks to spend points on
redemptions           ✅ When users claim perks
qr_codes              ✅ Admin-generated QR codes

-- REMOVE TABLES (Confusing/Unused)
rewards               ❌ Duplicate of unlocks
reward_redemptions    ❌ Use existing redemptions  
status_multipliers    ❌ Over-engineered
club_settlement_pools ❌ Complex operator stuff
preorder_campaigns    ❌ Phase 2 feature
preorder_commitments  ❌ Phase 2 feature
weekly_upfront_stats  ❌ Complex analytics
```

### **Admin System Fix**
Replace environment variable admin access with proper database roles:

```sql
-- Add role to users table
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user' 
  CHECK (role IN ('user', 'admin', 'club_owner'));

-- Make first user admin for testing
UPDATE users SET role = 'admin' 
WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1);
```

---

## 🚀 **Implementation Sprint**

### **Week 1: Clean & Fix Core**

**Monday-Tuesday: System Cleanup**
- [ ] Run SQL cleanup (remove unused tables)
- [ ] Consolidate to single points system
- [ ] Remove confusing API routes
- [ ] Fix admin role system

**Wednesday-Thursday: Core Flow Testing**  
- [ ] Test QR scan → auth detection → join club → earn points
- [ ] Verify Stripe points purchasing works
- [ ] Test unlock redemption system
- [ ] Fix any broken flows

**Friday: Billfold Integration Prep**
- [ ] Document QR scanning API endpoints
- [ ] Test authentication with different user types
- [ ] Ensure tap-in flow works for wallet users

### **Week 2: Complete & Polish**

**Monday-Tuesday: Missing Features**
- [ ] Complete club creation (admin can create clubs)
- [ ] Build dedicated perks management page
- [ ] Finish unlock CRUD operations

**Wednesday-Thursday: Polish & Test**
- [ ] UI improvements and mobile optimization
- [ ] End-to-end user testing
- [ ] Performance optimization
- [ ] Bug fixes

**Friday: Deploy & Document**
- [ ] Production deployment
- [ ] API documentation for Billfold integration
- [ ] Clean up old documentation files

---

## 🔄 **Core User Flows** 

### **1. New User QR Scan Flow**
```
User scans QR → /tap?club=uuid&source=show_entry
              ↓
Not logged in → Redirect to /login?redirect=/tap?club=...
              ↓  
Login/signup → Return to /tap page
              ↓
Auto-join club → Create point wallet → Award points → Show celebration
```

### **2. Existing User QR Scan Flow**  
```
User scans QR → /tap?club=uuid&source=show_entry
              ↓
Already logged in → Check club membership
                  ↓
Not member → Auto-join club
           ↓
Award points → Update status if threshold reached → Show celebration
```

### **3. Points Purchase Flow**
```
User clicks "Buy Points" → Stripe checkout ($10 = 1000 points)
                        ↓
Payment success → Update point_wallets → Show success + confetti
```

### **4. Unlock Redemption Flow**
```
User views unlocks → Check status requirements → Click redeem
                   ↓
Sufficient points & status → Deduct points → Create redemption → Show success
```

---

## 🎮 **Admin Experience**

### **Current Admin Dashboard** (Keep & Improve)
- **Clubs Tab** - View all clubs, create new ones
- **Members Tab** - View all members across clubs  
- **QR Codes Tab** - Generate QR codes for events
- **Analytics Tab** - Basic engagement metrics

### **New Dedicated Perks Page** (`/admin/perks`)
- Full CRUD for unlocks/perks
- Better organization than current mixed tabs
- Preview how perks appear to users
- Bulk operations for common perks

---

## 🔧 **Technical Architecture**

### **API Routes** (Keep These)
```
/api/clubs                    - List/create clubs
/api/clubs/[id]/join          - Join a club  
/api/tap-in                   - Process QR scans
/api/points/purchase          - Buy points via Stripe
/api/points/global-balance    - User's total points
/api/unlocks/[id]/redeem      - Spend points on perks
/api/admin/clubs              - Admin club management
```

### **Database Schema** (Simplified)
```sql
-- Users with roles
users (id, email, privy_id, role, created_at)

-- Artist/label communities  
clubs (id, owner_id, name, description, city, is_active)

-- Free club memberships
club_memberships (user_id, club_id, points, current_status, join_date)

-- Unified points system ($1 = 100 points)
point_wallets (user_id, club_id, balance_pts, earned_pts, purchased_pts)
point_transactions (wallet_id, type, pts, usd_gross_cents, created_at)

-- QR scanning for points
tap_ins (user_id, club_id, source, points_earned, location, created_at)

-- Perks to spend points on
unlocks (club_id, title, description, min_status, points_price, stock)
redemptions (user_id, unlock_id, status, redeemed_at)
```

---

## 🎯 **Success Metrics**

### **MVP Launch Criteria**
- [ ] Users can scan QR codes and earn points
- [ ] Points purchasing works via Stripe
- [ ] Status progression (Cadet → Superfan) functions
- [ ] Users can spend points on unlocks  
- [ ] Admin can create clubs and manage perks
- [ ] Billfold users can participate seamlessly

### **Key Metrics to Track**
- **QR Scans** - Daily tap-ins across all clubs
- **Club Joins** - New memberships from QR scans  
- **Points Purchased** - Revenue from point sales
- **Unlock Redemptions** - Points spent on perks
- **Status Progression** - Users advancing tiers

---

## 🚀 **Post-MVP Roadmap** (Phase 2)

### **Enhanced Features** (After MVP Ships)
- **Escrow Campaigns** - Pre-order vinyl/merch with points
- **Social Features** - Referral bonuses, leaderboards
- **Advanced Analytics** - Detailed engagement metrics
- **Mobile App** - Native iOS/Android with better QR scanning
- **API Expansion** - Full partner integration suite

### **Business Features**
- **Club Owner Dashboard** - Self-service club management
- **Revenue Sharing** - Split point sales with artists
- **Promotional Campaigns** - Bonus point events
- **Merchandise Integration** - Direct merch purchasing

---

## 🔒 **Security & Performance**

### **Security Measures**
- Rate limiting on QR scanning endpoints
- Idempotent point transactions (prevent double-spending)
- Role-based admin access (no more env variables)
- Input validation on all user data

### **Performance Optimizations**
- 30-second caching on points balance queries
- Optimized database indexes on frequently queried columns
- Lazy loading of club images and media
- Mobile-first responsive design

---

## 📋 **Immediate Next Steps**

1. **System Cleanup** - Run SQL cleanup script to remove unused tables
2. **Admin Fix** - Add role column and proper admin access
3. **Flow Testing** - Verify core QR → points → unlocks flow works
4. **Billfold Prep** - Document API endpoints for integration

**This plan focuses on shipping a clean, working product that matches the original vision while supporting the Billfold partnership. No feature creep, no over-engineering - just solid execution.**
