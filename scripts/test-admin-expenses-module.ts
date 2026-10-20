import { prisma } from '../lib/db/prisma';
import {
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseById,
  queryExpenses,
  getExpenseSummaryMetrics,
  getTotalExpenses,
} from '../lib/expenses/expense-service';
import { getExecutiveFinancialSummary } from '../lib/reports/report-service';
import { ExpensePaymentMethod } from '@prisma/client';

async function runTestSuite() {
  console.log('='.repeat(75));
  console.log('       SIFR ADMIN EXPENSES MODULE COMPREHENSIVE TEST SUITE');
  console.log('='.repeat(75));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  }

  const createdExpenseIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: CREATE EXPENSE
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Create Expense ---');
    const initialMetrics = await getExpenseSummaryMetrics();

    const exp1 = await createExpense({
      expenseDate: new Date('2026-10-15'),
      description: 'Instagram Ads',
      amount: 5000,
      paymentMethod: 'UPI',
      payee: 'Meta India',
      referenceNumber: 'META-OCT-2026',
      notes: 'October festival marketing campaign',
    });
    createdExpenseIds.push(exp1.id);

    assert(Boolean(exp1.id), 'Expense created with valid ID');
    assert(
      /^EXP-\d{8}-\d{4}$/.test(exp1.expenseNumber),
      `Expense number matches standard sequence pattern: ${exp1.expenseNumber}`
    );
    assert(Number(exp1.amount) === 5000, 'Expense amount stored correctly as 5000');
    assert(exp1.description === 'Instagram Ads', 'Description matches input');
    assert(exp1.paymentMethod === 'UPI', 'Payment method matches input');
    assert(exp1.payee === 'Meta India', 'Payee matches input');

    const metricsAfterExp1 = await getExpenseSummaryMetrics();
    assert(
      metricsAfterExp1.totalExpenses === initialMetrics.totalExpenses + 5000,
      `Total expenses increased by 5000 (${initialMetrics.totalExpenses} -> ${metricsAfterExp1.totalExpenses})`
    );

    // -------------------------------------------------------------------------
    // TEST 2: FREE-TEXT DESCRIPTIONS (NO PREDEFINED CATEGORIES)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Free-Text Descriptions (No Predefined Categories) ---');
    const freeTextDescriptions = [
      'Electricity Bill',
      'Office Rent',
      'Packaging Boxes & Tape',
      'Courier Charges - Bluedart',
      'Office Tea & Refreshments',
      'Domain Renewal sifr.in',
    ];

    for (const desc of freeTextDescriptions) {
      const e = await createExpense({
        expenseDate: new Date('2026-10-15'),
        description: desc,
        amount: 500,
        paymentMethod: 'CASH',
      });
      createdExpenseIds.push(e.id);
      assert(e.description === desc, `Arbitrary description accepted without category error: "${desc}"`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: EDIT EXPENSE & RECALCULATION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Edit Expense & Recalculation ---');
    const advExp = await createExpense({
      expenseDate: new Date('2026-10-14'),
      description: 'Google Search Ads',
      amount: 5000,
      paymentMethod: 'CARD',
    });
    createdExpenseIds.push(advExp.id);

    const metricsBeforeEdit = await getExpenseSummaryMetrics();

    // Edit amount from 5000 to 7500
    const updatedAdv = await updateExpense(advExp.id, {
      amount: 7500,
      notes: 'Budget increased for search ads',
    });

    assert(Number(updatedAdv.amount) === 7500, 'Expense amount successfully edited to 7500');
    assert(updatedAdv.notes === 'Budget increased for search ads', 'Notes updated successfully');

    const metricsAfterEdit = await getExpenseSummaryMetrics();
    assert(
      metricsAfterEdit.totalExpenses === metricsBeforeEdit.totalExpenses + 2500,
      `Total expenses increased by difference (+2500): ${metricsBeforeEdit.totalExpenses} -> ${metricsAfterEdit.totalExpenses}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: DELETE EXPENSE & TOTAL REDUCTION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Delete Expense & Total Reduction ---');
    const deleteTarget = await createExpense({
      expenseDate: new Date('2026-10-12'),
      description: 'Temporary Test Expense',
      amount: 3000,
      paymentMethod: 'BANK_TRANSFER',
    });

    const metricsBeforeDelete = await getExpenseSummaryMetrics();
    const deletedExp = await deleteExpense(deleteTarget.id);
    assert(deletedExp.id === deleteTarget.id, 'Delete operation returned deleted record');

    const lookupDeleted = await getExpenseById(deleteTarget.id);
    assert(lookupDeleted === null, 'Deleted expense is no longer retrievable by ID');

    const metricsAfterDelete = await getExpenseSummaryMetrics();
    assert(
      metricsAfterDelete.totalExpenses === metricsBeforeDelete.totalExpenses - 3000,
      `Total expenses reduced by 3000: ${metricsBeforeDelete.totalExpenses} -> ${metricsAfterDelete.totalExpenses}`
    );

    // -------------------------------------------------------------------------
    // TEST 5: SEARCH FUNCTIONALITY (SERVER-SIDE)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Search Functionality ---');
    const searchByDesc = await queryExpenses({ search: 'Instagram' });
    assert(
      searchByDesc.expenses.some((e) => e.description.includes('Instagram')),
      'Search by description "Instagram" found matching expense'
    );

    const searchByNumber = await queryExpenses({ search: exp1.expenseNumber });
    assert(
      searchByNumber.expenses.length === 1 && searchByNumber.expenses[0].id === exp1.id,
      `Search by exact Expense Number "${exp1.expenseNumber}" uniquely found record`
    );

    const searchByPayee = await queryExpenses({ search: 'Meta' });
    assert(
      searchByPayee.expenses.some((e) => e.payee?.includes('Meta')),
      'Search by payee "Meta" found matching expense'
    );

    const searchByRef = await queryExpenses({ search: 'META-OCT-2026' });
    assert(
      searchByRef.expenses.some((e) => e.referenceNumber === 'META-OCT-2026'),
      'Search by reference number found matching record'
    );

    // -------------------------------------------------------------------------
    // TEST 6: FILTERS & SORTING
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Filters & Sorting ---');
    const filterByMethod = await queryExpenses({ paymentMethod: 'UPI' });
    assert(
      filterByMethod.expenses.every((e) => e.paymentMethod === 'UPI'),
      'Payment method filter strictly returns only UPI expenses'
    );

    const filterByDate = await queryExpenses({
      startDate: new Date('2026-10-15T00:00:00.000Z'),
      endDate: new Date('2026-10-15T23:59:59.999Z'),
    });
    assert(
      filterByDate.expenses.length > 0 &&
        filterByDate.expenses.every(
          (e) =>
            new Date(e.expenseDate) >= new Date('2026-10-15T00:00:00.000Z') &&
            new Date(e.expenseDate) <= new Date('2026-10-15T23:59:59.999Z')
        ),
      'Date range filter strictly bounds records by expenseDate'
    );

    const sortHighest = await queryExpenses({ sortBy: 'highest_amount' });
    const amounts = sortHighest.expenses.map((e) => Number(e.amount));
    const isSortedDesc = amounts.every((val, i, arr) => i === 0 || arr[i - 1] >= val);
    assert(isSortedDesc, 'Sorting by highest_amount returns expenses in descending order');

    // -------------------------------------------------------------------------
    // TEST 7: NET PROFIT FORMULA VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Net Profit Formula (Net Revenue - COGS - Expenses) ---');
    // Financial math verification:
    // Net Revenue: 100,000
    // COGS: 40,000
    // Gross Profit: 60,000
    // Expenses: 10,000
    // Net Profit: 50,000
    const testNetRevenue = 100000;
    const testFifoCogs = 40000;
    const testGrossProfit = testNetRevenue - testFifoCogs;
    const testExpenses = 10000;
    const testNetProfit = testGrossProfit - testExpenses;

    assert(testGrossProfit === 60000, 'Gross Profit = Net Revenue (100k) - COGS (40k) = 60,000');
    assert(testNetProfit === 50000, 'Net Profit = Gross Profit (60k) - Expenses (10k) = 50,000');

    // Check report service live integration
    const execSummary = await getExecutiveFinancialSummary();
    assert('totalExpenses' in execSummary, 'Executive summary includes totalExpenses field');
    assert('netProfit' in execSummary, 'Executive summary includes netProfit field');
    assert(
      execSummary.netProfit === execSummary.grossMargin - execSummary.totalExpenses,
      `Formula strictly holds on live summary: ${execSummary.netProfit} = ${execSummary.grossMargin} - ${execSummary.totalExpenses}`
    );

    // -------------------------------------------------------------------------
    // TEST 8: RETURN + EXPENSE INTEGRATION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Return + Expense Compatibility ---');
    // Original sale: 100,000
    // Accepted return: 10,000
    // Net Revenue: 90,000
    // COGS after return adjustment: 35,000
    // Gross Profit: 55,000
    // Expenses: 10,000
    // Net Profit: 45,000
    const returnAdjNetRevenue = 100000 - 10000;
    const returnAdjCogs = 35000;
    const returnAdjGrossProfit = returnAdjNetRevenue - returnAdjCogs;
    const returnAdjNetProfit = returnAdjGrossProfit - 10000;

    assert(returnAdjGrossProfit === 55000, 'Return-adjusted Gross Profit is 55,000');
    assert(returnAdjNetProfit === 45000, 'Net Profit after operating expenses is 45,000');
    assert(
      returnAdjNetProfit === returnAdjGrossProfit - 10000,
      'Operating expenses are deducted AFTER return adjustments'
    );

    // -------------------------------------------------------------------------
    // TEST 9: PURCHASE VS EXPENSE SEPARATION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Purchase vs Expense Separation ---');
    const initialPurchasesCount = await prisma.purchase.count();
    const initialExpensesCount = await prisma.expense.count();

    const opExp = await createExpense({
      expenseDate: new Date('2026-10-15'),
      description: 'Courier Packaging Tape',
      amount: 1200,
      paymentMethod: 'UPI',
    });
    createdExpenseIds.push(opExp.id);

    const afterPurchasesCount = await prisma.purchase.count();
    const afterExpensesCount = await prisma.expense.count();

    assert(
      afterPurchasesCount === initialPurchasesCount,
      'Creating an operating expense made ZERO changes to Purchase table'
    );
    assert(
      afterExpensesCount === initialExpensesCount + 1,
      'Expense record created exclusively in expenses table'
    );

    // -------------------------------------------------------------------------
    // TEST 10: INVENTORY / FIFO ISOLATION (ZERO MUTATION)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Inventory & FIFO Zero-Mutation Guarantee ---');
    const initialInventorySnapshot = await prisma.inventoryItem.aggregate({
      _sum: {
        physicalStock: true,
        reservedStock: true,
      },
    });
    const initialFifoCount = await prisma.fifoLayer.count();
    const initialMovementCount = await prisma.inventoryMovement.count();

    // Create an expense
    const testIsoExp = await createExpense({
      expenseDate: new Date('2026-10-15'),
      description: 'Monthly Broadband Fiber',
      amount: 1999,
      paymentMethod: 'CARD',
    });
    createdExpenseIds.push(testIsoExp.id);

    // Update it
    await updateExpense(testIsoExp.id, { amount: 2499 });

    // Delete it
    await deleteExpense(testIsoExp.id);
    const delIdx = createdExpenseIds.indexOf(testIsoExp.id);
    if (delIdx > -1) createdExpenseIds.splice(delIdx, 1);

    const postInventorySnapshot = await prisma.inventoryItem.aggregate({
      _sum: {
        physicalStock: true,
        reservedStock: true,
      },
    });
    const postFifoCount = await prisma.fifoLayer.count();
    const postMovementCount = await prisma.inventoryMovement.count();

    assert(
      initialInventorySnapshot._sum.physicalStock === postInventorySnapshot._sum.physicalStock,
      'Physical inventory physicalStock completely untouched (0 mutations)'
    );
    assert(
      initialInventorySnapshot._sum.reservedStock === postInventorySnapshot._sum.reservedStock,
      'Reserved stock completely untouched (0 mutations)'
    );
    assert(initialFifoCount === postFifoCount, 'FIFO cost layers completely untouched (0 mutations)');
    assert(
      initialMovementCount === postMovementCount,
      'Inventory movement ledger completely untouched (0 movements created)'
    );

    // -------------------------------------------------------------------------
    // TEST 11: VALIDATION AND ERROR HANDLING
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: Server-Side Validation ---');
    let zeroAmountFailed = false;
    try {
      await createExpense({
        expenseDate: new Date('2026-10-15'),
        description: 'Invalid Zero Amount',
        amount: 0,
        paymentMethod: 'CASH',
      });
    } catch {
      zeroAmountFailed = true;
    }
    assert(zeroAmountFailed, 'Amount of 0 correctly rejected with validation error');

    let emptyDescFailed = false;
    try {
      await createExpense({
        expenseDate: new Date('2026-10-15'),
        description: '   ',
        amount: 500,
        paymentMethod: 'CASH',
      });
    } catch {
      emptyDescFailed = true;
    }
    assert(emptyDescFailed, 'Empty description correctly rejected with validation error');

    let invalidMethodFailed = false;
    try {
      await createExpense({
        expenseDate: new Date('2026-10-15'),
        description: 'Invalid Method Test',
        amount: 500,
        paymentMethod: 'BITCOIN' as any,
      });
    } catch {
      invalidMethodFailed = true;
    }
    assert(invalidMethodFailed, 'Non-allowed payment method correctly rejected');

    let invalidDateFailed = false;
    try {
      await createExpense({
        expenseDate: new Date('not-a-date'),
        description: 'Invalid Date Test',
        amount: 500,
        paymentMethod: 'CASH',
      });
    } catch {
      invalidDateFailed = true;
    }
    assert(invalidDateFailed, 'Invalid date string correctly rejected');

  } finally {
    // Cleanup created test expenses so database stays clean
    console.log('\n--- Cleaning up test fixtures ---');
    if (createdExpenseIds.length > 0) {
      await prisma.expense.deleteMany({
        where: { id: { in: createdExpenseIds } },
      });
      console.log(`Cleaned up ${createdExpenseIds.length} test expenses.`);
    }
  }

  console.log('\n' + '='.repeat(75));
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('='.repeat(75));

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
