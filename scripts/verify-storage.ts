
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env vars from root .env file
config({ path: resolve(__dirname, '../.env') });

console.log("Checking Environment Variables...");
console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "✅ Present" : "❌ Missing");
console.log("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ Present" : "❌ Missing");

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Critical: Missing Supabase environment variables. Cannot proceed.");
    process.exit(1);
}

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyStorage() {
    console.log("Verifying Supabase Storage Access...");
    try {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) {
            console.error("❌ Failed to list buckets:", error.message);
        } else {
            console.log("✅ Successfully listed buckets:", data.map(b => b.name));
        }
    } catch (e) {
        console.error("❌ Exception during storage verification:", e);
    }
}

verifyStorage();
