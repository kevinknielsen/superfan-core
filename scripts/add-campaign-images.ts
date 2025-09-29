// Quick script to add images to campaign items
// Usage: npx tsx scripts/add-campaign-images.ts

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE env vars. Check .env.local');
}

// ============================================================================
// UPDATE THESE URLS AFTER UPLOADING TO SUPABASE STORAGE
// ============================================================================

const ITEM_IMAGES = {
  'Digital Album': {
    image_url: 'https://kkxhjlzqvvcwvlidqtam.supabase.co/storage/v1/object/public/campaign-items/41e19a80-b04f-4077-b68c-258bd0b7894c/digital-album.jpg',
    image_alt: 'XXL Grooves Vol. 1 Digital Album Cover'
  },
  // Add more items as needed:
  // 'Limited Edition Hat': {
  //   image_url: 'https://kkxhjlzqvvcwvlidqtam.supabase.co/storage/v1/object/public/campaign-items/41e19a80-b04f-4077-b68c-258bd0b7894c/hat.jpg',
  //   image_alt: 'XXL Grooves Vol. 1 Hat'
  // }
};

async function addImages() {
  console.log('📸 Adding images to campaign items...\n');
  
  for (const [title, imageData] of Object.entries(ITEM_IMAGES)) {
    // Find all items with this title (titles may not be unique)
    const { data: items, error: fetchErr } = await supabase
      .from('tier_rewards')
      .select('id, title')
      .eq('title', title);
      
    if (fetchErr) {
      console.log(`❌ ${title}:`, fetchErr.message);
      continue;
    }
    
    if (!items || items.length === 0) {
      console.log(`⚠️  ${title}: no matching items found`);
      continue;
    }
    
    for (const item of items) {
      const { error: rpcErr } = await supabase.rpc('update_campaign_item_image', {
        p_item_id: item.id,
        p_image_url: imageData.image_url,
        p_image_alt: imageData.image_alt,
      });
      
      if (rpcErr) {
        console.log(`❌ ${title} (${item.id}):`, rpcErr.message);
      } else {
        console.log(`✅ ${title} (${item.id}): Image added`);
        console.log(`   ${imageData.image_url.substring(0, 80)}...`);
      }
    }
  }
  
  console.log('\n🎉 Done! Images will show in UI on next refresh.');
}

addImages().catch(console.error);
