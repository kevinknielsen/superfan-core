# Branch Strategy: Stripe → Unified Economy

## 🎯 **Current State Analysis**

### **Stripe Branch Status**
- ✅ **Points Purchase System**: Working Stripe integration for buying points
- ✅ **Webhook Infrastructure**: Payment processing with idempotency
- ✅ **Database Schema**: Point wallets and transactions
- ❌ **User Session Mapping**: Stripe sessions not linked to Privy users
- ❌ **House Account UI**: No user-facing components yet
- ❌ **Production Config**: Webhook endpoints not configured

### **Main Branch Status** 
- ✅ **Core Platform**: Club membership system working
- ✅ **QR Tap-ins**: Point earning through engagement
- ✅ **Admin Dashboard**: Club management and analytics
- ✅ **Production Deployment**: Stable and deployed

---

## 📋 **3-Phase Branch Strategy**

### **Phase 1: Stripe Branch Cleanup** (3-5 days)
**Goal**: Get stripe branch production-ready for merge

**Critical Fixes Needed:**
```typescript
// 1. Fix user identification in webhooks
// app/api/points/webhook/route.ts
async function getUserFromStripeSession(sessionId: string): Promise<string> {
  // IMPLEMENT: Map Stripe customer/session to Privy user
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['customer']
  });
  
  // Option A: Use customer metadata
  if (session.customer?.metadata?.privy_user_id) {
    return session.customer.metadata.privy_user_id;
  }
  
  // Option B: Use session metadata (set during checkout creation)
  if (session.metadata?.user_id) {
    return session.metadata.user_id;
  }
  
  throw new Error('Cannot identify user from Stripe session');
}
```

**Tasks:**
- [ ] Fix webhook user identification
- [ ] Add user context to checkout session creation  
- [ ] Create basic house account UI components
- [ ] Test end-to-end payment flow
- [ ] Configure Stripe webhooks in dashboard
- [ ] Set production environment variables

**Testing Checklist:**
- [ ] User can purchase points successfully
- [ ] Webhook processes payment and credits points
- [ ] Points appear in user's balance immediately
- [ ] Admin can view purchase analytics
- [ ] Error handling works for failed payments

---

### **Phase 2: Merge to Main** (1 day)
**Goal**: Integrate working Stripe system with main branch

**Pre-merge Checklist:**
```bash
# 1. Ensure stripe branch is clean
git status
git add .
git commit -m "feat: finalize Stripe integration for merge"

# 2. Rebase on latest main to avoid conflicts
git fetch origin main
git rebase origin/main

# 3. Run full test suite
npm run build
npm run lint

# 4. Test deployment on staging
# (Deploy stripe branch to staging environment)
```

**Merge Strategy:**
```bash
# Option A: Merge commit (preserves history)
git checkout main
git pull origin main
git merge stripe
git push origin main

# Option B: Squash merge (cleaner history)
git checkout main  
git pull origin main
git merge --squash stripe
git commit -m "feat: integrate Stripe points purchase system

- Add point purchase bundles with Stripe checkout
- Implement webhook processing with idempotency  
- Create point wallet management system
- Add admin analytics for purchases
- Configure production payment processing"
git push origin main
```

---

### **Phase 3: New Branch for Unified Economy** (Start immediately after merge)
**Goal**: Create dedicated branch for the revolutionary new system

**Branch Creation:**
```bash
# Create new branch from fresh main
git checkout main
git pull origin main  
git checkout -b unified-economy
git push -u origin unified-economy
```

**Initial Setup:**
```bash
# 1. Copy implementation plan
cp UNIFIED_ECONOMY_PLAN.md docs/
git add docs/UNIFIED_ECONOMY_PLAN.md
git commit -m "docs: add unified economy implementation plan"

# 2. Create feature branch structure
mkdir -p docs/unified-economy
mkdir -p migrations/unified-economy
mkdir -p components/unified-economy
mkdir -p hooks/unified-economy
mkdir -p lib/unified-economy

# 3. Set up project tracking
echo "# Unified Economy Development

## Current Phase: Phase 1 - Unified Points Foundation
## Target Completion: $(date -d '+2 weeks' '+%Y-%m-%d')

## Progress Tracking
- [ ] Database schema updates
- [ ] Unified point wallet logic  
- [ ] Smart spending algorithms
- [ ] Status protection features
- [ ] Purchase bundle enhancements
" > docs/unified-economy/PROGRESS.md
```

---

## 🚀 **Recommended Timeline**

### **Week 1: Stripe Cleanup**
- **Mon-Wed**: Fix webhook user mapping and test flows
- **Thu-Fri**: Create basic UI components and production config

### **Week 2: Merge & New Branch**  
- **Mon**: Final testing and merge preparation
- **Tue**: Merge stripe → main, deploy to production
- **Wed**: Create unified-economy branch and initial setup
- **Thu-Fri**: Begin Phase 1 implementation

### **Weeks 3-4: Phase 1 Implementation**
- Unified point wallet system
- Smart spending logic
- Enhanced purchase flows

### **Weeks 5-6: Phase 2 Implementation** 
- Advanced status mechanics
- Social features and leaderboards

### **Weeks 7-9: Phase 3 Implementation**
- Pre-order escrow system
- Campaign management
- MOQ tracking and resolution

---

## 🔧 **Development Workflow**

### **Branch Naming Convention**
```
unified-economy/              # Main development branch
├── feature/points-wallet     # Individual features
├── feature/escrow-system     # 
├── feature/campaign-ui       #
└── hotfix/critical-bug       # Emergency fixes
```

### **Commit Message Format**
```
feat(points): add unified wallet with spending breakdown
feat(escrow): implement campaign commitment system  
fix(payments): resolve webhook user identification
docs(economy): update implementation plan phase 2
test(escrow): add campaign resolution test suite
```

### **Pull Request Process**
1. **Feature Branch**: Create from `unified-economy`
2. **Implementation**: Build feature with tests
3. **Review**: Comprehensive code review  
4. **Testing**: Full integration testing
5. **Merge**: Squash merge into `unified-economy`
6. **Deploy**: Continuous deployment to staging

---

## 📊 **Risk Mitigation**

### **Technical Risks**
- **Database Migration Complexity**: Test thoroughly on staging
- **Payment Integration Issues**: Comprehensive error handling
- **Performance Impact**: Monitor query performance with new schema
- **User Experience Disruption**: Feature flags for gradual rollout

### **Business Risks**  
- **User Confusion**: Clear communication about system changes
- **Artist Adoption**: Beta test with friendly artists first
- **Revenue Impact**: Monitor conversion rates closely
- **Support Burden**: Comprehensive documentation and FAQs

### **Rollback Strategy**
```bash
# Emergency rollback plan
git checkout main
git revert <merge-commit-hash>
git push origin main

# Or use feature flags
UPDATE feature_flags SET enable_unified_economy = false;
```

---

## 🎯 **Success Criteria**

### **Stripe Branch Merge Success**
- [ ] All payment flows work end-to-end
- [ ] Zero critical bugs in production
- [ ] Performance metrics maintained
- [ ] User experience improved

### **Unified Economy Launch Success**
- [ ] 90%+ user adoption of new point system
- [ ] First successful escrow campaign
- [ ] 25%+ increase in engagement metrics
- [ ] Artist satisfaction with demand validation

This strategy balances **moving fast** with **maintaining stability**. The stripe branch has solid foundations that just need finishing touches, while the unified economy represents the future of the platform.

Ready to execute this plan? 🚀
