// Quick script to add images to campaign items
// Usage: npx tsx scripts/add-campaign-images.ts

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const { data, error } = await supabase
      .from('tier_rewards')
      .update({
        metadata: {
          image_url: imageData.image_url,
          image_alt: imageData.image_alt
        }
      })
      .eq('title', title)
      .select('id, title')
      .single();
      
    if (error) {
      console.log(`❌ ${title}:`, error.message);
    } else {
      console.log(`✅ ${title}: Image added`);
      console.log(`   ${imageData.image_url.substring(0, 80)}...`);
    }
  }
  
  console.log('\n🎉 Done! Images will show in UI on next refresh.');
}

addImages().catch(console.error);
