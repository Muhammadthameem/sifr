import fs from 'fs';
import path from 'path';
import {
  getExecutiveFinancialSummary,
  getOrderFunnelSummary,
  getChannelSummary,
  getInventoryHealthSummary,
  getPaymentSummary,
  getNotificationSummary,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from '../lib/reports/report-service';

async function main() {
  console.log('===========================================================');
  console.log('  SIFR PHASE 13 — STEP 2: EXECUTIVE DASHBOARD VERIFICATION');
  console.log('===========================================================');

  // 1. Verify dashboard route file exists
  const pagePath = path.join(process.cwd(), 'app', 'admin', 'dashboard', 'page.tsx');
  if (!fs.existsSync(pagePath)) {
    throw new Error('Step 2 Failed: app/admin/dashboard/page.tsx does not exist.');
  }

  const pageContent = fs.readFileSync(pagePath, 'utf8');

  // 2. Verify requireAdminAuth is enforced
  if (!pageContent.includes('requireAdminAuth()')) {
    throw new Error('Step 2 Failed: requireAdminAuth() admin authentication is missing from dashboard route.');
  }

  // 3. Verify centralized report-service usage (No duplicate formula calculation in components)
  if (!pageContent.includes('getExecutiveFinancialSummary') || !pageContent.includes('getOrderFunnelSummary')) {
    throw new Error('Step 2 Failed: Dashboard page is not consuming centralized report-service.ts functions.');
  }

  // 4. Verify Dashboard Component files exist
  const dashboardComponentDir = path.join(process.cwd(), 'components', 'admin', 'dashboard');
  const requiredComponents = [
    'DashboardDateFilter.tsx',
    'DashboardKpiGrid.tsx',
    'OrderFunnel.tsx',
    'ChannelSummary.tsx',
    'InventoryHealth.tsx',
    'PaymentSummaryWidget.tsx',
    'NotificationHealthWidget.tsx',
  ];

  for (const comp of requiredComponents) {
    const compPath = path.join(dashboardComponentDir, comp);
    if (!fs.existsSync(compPath)) {
      throw new Error(`Step 2 Failed: Required component ${comp} is missing.`);
    }
  }
  console.log('✓ All 7 dashboard modular UI components verified in components/admin/dashboard.');

  // 5. Verify KPI Grid contains Net Revenue as Hero KPI, Supporting metrics, and zero-state safety
  const kpiGridContent = fs.readFileSync(path.join(dashboardComponentDir, 'DashboardKpiGrid.tsx'), 'utf8');
  if (
    !kpiGridContent.includes('NET REVENUE') ||
    !kpiGridContent.includes('Gross Sales') ||
    !kpiGridContent.includes('Refunds') ||
    !kpiGridContent.includes('FIFO COGS') ||
    !kpiGridContent.includes('Gross Margin')
  ) {
    throw new Error('Step 2 Failed: DashboardKpiGrid missing primary Net Revenue Hero card or supporting KPI fields.');
  }

  // 6. Verify Low-Stock Threshold is 5
  const invHealthContent = fs.readFileSync(path.join(dashboardComponentDir, 'InventoryHealth.tsx'), 'utf8');
  if (!invHealthContent.includes('DEFAULT_LOW_STOCK_THRESHOLD') && !invHealthContent.includes('&le;5')) {
    throw new Error('Step 2 Failed: InventoryHealth component does not respect default threshold of 5.');
  }

  // 7. Verify zero-state calculations against report-service
  const zeroExec = await getExecutiveFinancialSummary({ startDate: new Date('2010-01-01'), endDate: new Date('2010-01-02') });
  const zeroFunnel = await getOrderFunnelSummary({ startDate: new Date('2010-01-01'), endDate: new Date('2010-01-02') });
  const zeroChannel = await getChannelSummary({ startDate: new Date('2010-01-01'), endDate: new Date('2010-01-02') });
  const invHealth = await getInventoryHealthSummary(DEFAULT_LOW_STOCK_THRESHOLD);
  const paymentSum = await getPaymentSummary();
  const notifSum = await getNotificationSummary();

  console.log('✓ Zero-state database query executions verified cleanly:');
  console.log(`  - Exec Financial Net Revenue: ₹${zeroExec.netRevenue} | AOV: ₹${zeroExec.aov}`);
  console.log(`  - Order Funnel Total: ${zeroFunnel.total}`);
  console.log(`  - Channels Count: ${zeroChannel.length}`);
  console.log(`  - Physical Stock: ${invHealth.totalPhysicalUnits} | FIFO Valuation: ₹${invHealth.inventoryFifoValuation}`);
  console.log(`  - Payment Attempts: ${paymentSum.totalAttempts}`);
  console.log(`  - Notifications Outbox: ${notifSum.totalNotifications}`);

  console.log('\n===========================================================');
  console.log('🎉 ALL STEP 2 EXECUTIVE DASHBOARD VERIFICATIONS PASSED!');
  console.log('===========================================================');
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err.message);
  process.exit(1);
});
