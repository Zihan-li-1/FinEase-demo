// Model-only shape repair. The purchase flow already defaults an unspecified
// item quantity to one. All other fields still pass the strict intent validator.
export function normalizePurchaseModelItems(intent, context) {
  if (context || intent?.action !== 'scenario.plan_purchase' || !Array.isArray(intent.slots?.items)) return intent;
  const items = intent.slots.items.map(item => ['flowers', 'cake', 'headphones'].includes(item)
    ? { category: item, quantity: 1 }
    : item);
  return { ...intent, slots: { ...intent.slots, items } };
}
