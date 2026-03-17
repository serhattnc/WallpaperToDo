import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wigiobgjgjmnozhpajny.supabase.co';
const supabaseAnonKey = 'sb_publishable_bTvY9IhQHCcHTpZKDN1iYw_P7lYTdX8'; // Using the provided Publishable Key

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
