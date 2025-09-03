import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    adminUserIds: process.env.ADMIN_USER_IDS,
    enableAdminPanel: process.env.ENABLE_ADMIN_PANEL,
    hasAdminEnv: !!process.env.ADMIN_USER_IDS,
    envLength: process.env.ADMIN_USER_IDS?.length || 0,
    timestamp: new Date().toISOString()
  });
}
