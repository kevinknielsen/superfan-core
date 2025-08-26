# Cap Table Implementation Plan

## Overview

Updating the cap table system to align with music industry standards based on insights from Ari's Take article on producer and songwriter splits.

## Phase 1: Data Model Updates ✅ COMPLETED

- [x] Updated TypeScript interfaces to include copyright types
- [x] Added producer-specific fields (points, flat fees, backend percentages)
- [x] Added PRO (Performance Rights Organization) fields
- [x] Created database migration script
- [x] Updated team splits form with new fields

### Files Modified:

- `types/project.ts` - Updated TeamMember interface
- `migrations/add_copyright_fields.sql` - Database migration
- `components/team-splits-form.tsx` - Enhanced form with new fields
- `components/launch-form.tsx` - Updated default data and loading

## Phase 1.5: Collaborators Management Tab ✅ COMPLETED

- [x] Added Collaborators tab to project navigation
- [x] Created dedicated collaborators page with edit functionality
- [x] Inline editing for all new copyright and producer fields
- [x] Role-based permissions (only creators/admins can edit)
- [x] Beautiful UI with conditional field display

### Files Modified:

- `app/projects/[id]/page.tsx` - Added Collaborators tab
- `app/projects/[id]/collaborators/page.tsx` - New collaborators management page
- `app/projects/[id]/cap-table/page.tsx` - Added Collaborators tab to navigation

## Phase 2: Cap Table Visualization Updates ✅ COMPLETED

- [x] Updated cap table to fetch new copyright and producer fields
- [x] Replaced hardcoded composition data with dynamic team member data
- [x] Enhanced recording chart to use copyright_type filtering
- [x] Added producer deal information section with fees, points, and deal types
- [x] Enhanced chart legends with PRO and publisher information
- [x] Proper separation of composition vs recording rights visualization

### Files Modified:

- `app/projects/[id]/cap-table/page.tsx` - Updated data model, charts, and added producer deals

## Phase 2.5: Simplified Launch Form ✅ COMPLETED

- [x] Simplified team splits form to focus on essential fields only
- [x] Removed detailed copyright, producer, and PRO fields from launch flow
- [x] Removed wallet address requirement during project creation
- [x] Added helpful guidance about completing details later
- [x] Set smart defaults for copyright types based on roles

### Files Modified:

- `components/team-splits-form.tsx` - Simplified form with essential fields only
- `components/launch-form.tsx` - Removed wallet validation, added smart defaults

### Benefits:

- **Faster project creation** - Users can launch projects quickly
- **Better UX** - Less overwhelming initial experience
- **Progressive disclosure** - Add complex details when ready
- **Streamlined workflow** - Focus on core project info first

## Phase 3: Industry Standards Integration (NEXT)

- [ ] Add split sheet export functionality
- [ ] Create PRO registration helper
- [ ] Add producer deal templates for project creation
- [ ] Industry-standard metrics display
- [ ] Split sheet generation with proper formatting

## Phase 4: Testing & Validation (FUTURE)

- [ ] Test with existing projects
- [ ] Validate split calculations
- [ ] User experience testing
- [ ] Performance optimization

## ✅ What's Working Now:

### **Enhanced Cap Table:**

- **Dynamic Composition Chart** - Shows actual songwriters/composers with PRO info
- **Enhanced Recording Chart** - Filtered by copyright type with producer details
- **Producer Deals Section** - Shows fees, points, deal types, and rights
- **Smart Chart Legends** - PRO affiliations and publisher information
- **Real-time Data** - No more hardcoded mock data

### **Streamlined Workflow:**

1. **Quick Project Creation** - Simplified launch form focuses on essentials
2. **Smart Defaults** - Copyright types auto-set based on roles
3. **Progressive Enhancement** - Add detailed info when ready via Collaborators tab
4. **Complete Management** - Full editing capability in dedicated collaborators page
5. **Industry-Standard Visualization** - Professional cap table with real data
6. **Proper Access Controls** - Role-based permissions throughout

### **User Experience:**

- **Fast Launch** - Create projects without overwhelming detail requirements
- **Flexible Timing** - Add wallet addresses and copyright details later
- **Clear Guidance** - Helpful hints about where to complete additional info
- **Professional Output** - Industry-standard cap tables once details are added

## Next Steps

### Immediate Actions:

1. **Run the database migration** in your Supabase dashboard:

   ```sql
   -- Copy and paste the contents of migrations/add_copyright_fields.sql
   ```

2. **Test the updated form**:

   - Try creating a new project
   - Add a Producer and test the new producer-specific fields
   - Add a Songwriter and test the PRO fields

3. **Update the cap table page** to use the new data structure

### Database Migration Instructions:

1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `migrations/add_copyright_fields.sql`
4. Run the migration
5. Verify the new columns were added to `team_members` table

### Testing Checklist:

- [ ] Create new project with Producer role
- [ ] Test different producer deal types (indie, major label, flat fee only)
- [ ] Test songwriter with PRO affiliation
- [ ] Verify data saves correctly to database
- [ ] Check cap table displays new information

## Notes:

- The migration script includes backward compatibility for existing data
- Default values are set based on role types
- Form validation ensures proper data entry
- Copyright types are now clearly separated per industry standards
