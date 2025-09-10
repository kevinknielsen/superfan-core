# Tier Rewards System - Database Migration Instructions

## Phase 1: Database Setup - READY FOR EXECUTION

I have completed **Phase 1: Database Setup** and created 3 comprehensive SQL migration files that are ready for you to execute in the Supabase SQL editor.

### Migration Files Created

#### 1. `migrations/019_tier_rewards_system.sql`
**Purpose**: Core database schema setup
**Contains**:
- 6 new tables: `tier_rewards`, `reward_claims`, `temporary_tier_boosts`, `quarterly_claim_tracking`, `upgrade_transactions`, `webhook_events`
- Auto-pricing triggers and inventory management
- Row Level Security (RLS) policies
- Comprehensive indexes for performance
- Analytics view `v_tier_rewards_with_stats`

#### 2. `migrations/020_tier_rewards_business_logic.sql`
**Purpose**: Business logic functions
**Contains**:
- Tier qualification functions (`check_tier_qualification`, `compute_tier_from_points`)
- Atomic claim processing (`atomic_free_claim`)
- Dynamic pricing functions (`calculate_dynamic_safety_factor`)
- Reward availability checking (`check_reward_availability`)
- Quarter management functions

#### 3. `migrations/021_migrate_unlocks_to_tier_rewards.sql`
**Purpose**: Data migration from existing system
**Contains**:
- Migration of existing `unlocks` → `tier_rewards`
- Migration of existing `redemptions` → `reward_claims`
- Backup table creation for rollback safety
- Verification views for migration validation
- Comprehensive migration reporting

### Execution Instructions

**IMPORTANT**: Run these migrations in **exact order** in the Supabase SQL editor:

1. **First**: Execute `migrations/019_tier_rewards_system.sql`
2. **Second**: Execute `migrations/020_tier_rewards_business_logic.sql`
3. **Third**: Execute `migrations/021_migrate_unlocks_to_tier_rewards.sql`

### What Each Migration Does

#### Migration 019 (Core Schema)
```sql
-- Creates 6 new tables with proper relationships
-- Sets up auto-pricing triggers
-- Implements Row Level Security
-- Creates analytics views
```

#### Migration 020 (Business Logic)
```sql
-- Adds tier qualification logic
-- Creates atomic claim processing
-- Implements dynamic pricing algorithms
-- Adds safety and validation functions
```

#### Migration 021 (Data Migration)
```sql
-- Migrates existing unlocks → tier_rewards
-- Migrates existing redemptions → reward_claims
-- Creates backup tables for safety
-- Provides verification queries
```

### Post-Migration Verification

After running all 3 migrations, you can verify success with these queries:

```sql
-- Check migration summary
SELECT * FROM v_migration_verification;

-- View detailed migration report
SELECT * FROM v_migration_report;

-- Verify table counts
SELECT 
  'tier_rewards' as table_name, COUNT(*) as records FROM tier_rewards
UNION ALL
SELECT 
  'reward_claims' as table_name, COUNT(*) as records FROM reward_claims;
```

### Safety Features

- **Backup Tables**: Original `unlocks` and `redemptions` backed up as `unlocks_backup_pre_migration` and `redemptions_backup_pre_migration`
- **Verification Views**: `v_migration_verification` and `v_migration_report` help validate the migration
- **Rollback Ready**: All original data preserved for rollback if needed

### Expected Results

After successful migration:
- All active unlocks will be converted to tier_rewards
- All redemptions will become reward_claims  
- New tier rewards system will be fully functional
- Original data will be safely backed up
- Analytics and reporting will be available

### Next Steps After Migration

Once you confirm the migrations are successful, I'll proceed with **Phase 2: Backend APIs** which includes:
- Admin APIs for tier reward management
- User APIs for reward browsing and claiming
- Stripe integration for upgrade purchases
- Webhook handlers for payment processing

## Status: ✅ READY FOR EXECUTION

The database schema is complete and ready. Please execute the 3 migration files in order and let me know when they're successful so we can proceed to Phase 2.
