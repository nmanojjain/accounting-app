import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseUrl.startsWith('https://')) {
    console.error('Invalid Supabase URL:', supabaseUrl);
}

export const supabase = createBrowserClient(supabaseUrl, supabaseKey)
