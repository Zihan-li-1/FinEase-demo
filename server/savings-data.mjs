import { summarizeBills } from '../src/skills/bill/bill-summary.mjs';

const postedSummary = transactions => summarizeBills(transactions.filter(item => item.status === 'posted'));

export async function collectSavingsData(repository, currentDate) {
  const requiredMonth = new Date(Date.UTC(Number(currentDate.slice(0, 4)), Number(currentDate.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const context = await repository.getContextInfo();
  const asOfMonth = /^\d{4}-(0[1-9]|1[0-2])/.test(context.asOf || '') ? context.asOf.slice(0, 7) : '';
  const available = [...new Set((context.availableMonths || []).filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)))].sort();
  // Both availability and the source's completeness marker are required.
  // The snapshot month and the current calendar month are never complete here.
  const complete = available.filter(month => (context.completeMonths || []).includes(month) &&
    month < currentDate.slice(0, 7) && month < asOfMonth);
  const history = [];
  let recent = null;
  for (const month of [...complete].reverse()) {
    const transactions = await repository.getTransactions({ month });
    if (!transactions.some(item => item.status === 'posted')) continue;
    const summary = postedSummary(transactions);
    // An advertised month with no records is missing data, not a zero balance.
    if (!recent && transactions.some(item => item.status === 'posted' && item.type === 'income')) {
      recent = { month, income_minor: summary.totalIncomeFen, category_expenses_minor: summary.categoryTotals };
    } else if (recent) {
      history.unshift({ month, category_expenses_minor: summary.categoryTotals });
    }
  }
  const categories = [...new Set(recent ? Object.keys(recent.category_expenses_minor) :
    history.flatMap(item => Object.keys(item.category_expenses_minor)))].sort();
  const recentSource = recent ? 'repository' : 'user_provided';
  return { requiredMonth, context, history, recent, categories, recentSource,
    sources: { recent: recentSource, recent_as_of: recent ? context.asOf : currentDate, history: context.dataSource || 'synthetic_demo_only', history_as_of: context.asOf } };
}

