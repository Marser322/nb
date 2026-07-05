'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function logoutAdmin() {
    const cookieStore = await cookies()
    cookieStore.delete('admin_session')
    
    const supabase = await createClient()
    await supabase.auth.signOut()
    
    redirect('/admin-login')
}
