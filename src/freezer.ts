// The Freezer: stock of frozen dough balls, computed from a shared list of events.
// Nothing is ever edited in place: adding and removing are events, so two devices can't overwrite each other,
// and replaying the same events always gives the same stock on every device.

export type LedgerEventBase = {
  eventId: string;
  /** device clock time (display + ordering of not-yet-shared events) */
  at: string;
  device: string;
  /** order assigned by the shared sheet; absent until shared */
  seq?: number;
};

export type FreezerAdd = LedgerEventBase & {
  type: 'freezer.add';
  batchId: string;
  recipeId: string;
  recipeTitle: string;
  count: number;
  portionWeightG?: number;
  /** YYYY-MM-DD */
  frozenOn: string;
  note?: string;
  productionId?: string;
};

export type RemoveReason = 'baked' | 'order' | 'discarded' | 'correction' | 'other';
export type FreezerRemove = LedgerEventBase & {
  type: 'freezer.remove';
  recipeId: string;
  recipeTitle: string;
  count: number;
  reason: RemoveReason;
  /** take from this batch first (otherwise oldest first) */
  batchId?: string;
  note?: string;
  orderId?: string;
};

// ---- products & orders (v0.7) ----
export type MixOption = { recipeId: string; recipeTitle: string; dough?: boolean };
/**
 * Something on the menu. Single: one recipe (half dozen, dozen, box of 4 brownies…).
 * Mixed: the customer picks flavours from `options`, in groups of `step`, adding up to `pieces`.
 * `dough` = uses frozen dough balls from The Freezer (cookies). Missing means true (older products).
 */
export type Product = { productId: string; name: string; recipeId: string; recipeTitle: string; pieces: number; price: number; active: boolean;
  kind?: 'single' | 'mixed'; sizeLabel?: string; dough?: boolean; options?: MixOption[]; step?: number };
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type MixPart = { recipeId: string; recipeTitle: string; count: number; dough?: boolean };
/** A line on an order. For a mixed box, `mix` is what's in ONE box (counts add up to `pieces`). */
export type OrderItem = { productId: string; name: string; recipeId: string; recipeTitle: string; pieces: number; qty: number; unitPrice: number; dough?: boolean; mix?: MixPart[] };
export type Customer = { name: string; contact?: string };
export type ProductUpsert = LedgerEventBase & { type: 'product.upsert'; product: Product };
export type OrderCreate = LedgerEventBase & {
  type: 'order.create'; orderId: string; orderNo?: number; source: 'manual' | 'form'; status: OrderStatus;
  customer: Customer; items: OrderItem[]; pickupDate?: string; pickupGroup?: string; pickupId?: string; notes?: string; discount?: number; total: number; paid?: boolean;
  /** a free or discounted tasting box (kept out of sales totals) */
  sample?: boolean;
  /** "How did you hear about us?" from the order form */
  heardFrom?: string;
  /** a gift: who it's for and a short note */
  gift?: { to: string; message?: string };
  /** ticked "email me when new flavours or pickup days open" */
  news?: boolean;
  /** a pretend order from the Test order button (kept out of sales, reports and customers) */
  test?: boolean;
  /** a free loyalty half dozen was applied to this order (its price is in `discount`) */
  reward?: boolean;
  /** the customer ticked "use my free half dozen" but it couldn't be applied automatically */
  rewardAsk?: 'none' | 'need-half';
};
export type OrderUpdate = LedgerEventBase & { type: 'order.update'; orderId: string; patch: Partial<Pick<OrderCreate, 'customer' | 'items' | 'pickupDate' | 'pickupGroup' | 'pickupId' | 'notes' | 'discount' | 'total' | 'sample' | 'reward' | 'rewardAsk'>> };
export type OrderStatusEvent = LedgerEventBase & { type: 'order.status'; orderId: string; status: OrderStatus; costSnapshot?: { total: number | null; complete: boolean }; /** signed link for the "How were they?" email (sent by the sheet on pickup) */ feedbackLink?: string; /** opens the order form with the same boxes */ orderAgainLink?: string };
export type OrderPayment = LedgerEventBase & { type: 'order.payment'; orderId: string; paid: boolean; method?: string };

// ---- v0.10: pickup options, shop settings, packing, handoffs, shared bake history ----
export type PickupOption = { pickupId: string; name: string; details?: string; handler?: string; active: boolean };
export type OrderLimit = { pieces: number; per: 'day' | 'week' };
export type ShopSettings = { open: boolean; note?: string; emailCustomers: boolean;
  /** send "How were they?" after pickup (default on) */ askFeedback?: boolean;
  /** optional cap on how much can be ordered per pickup day or week */ limit?: OrderLimit | null;
  /** holiday lights & snow on the order form */ holiday?: boolean;
  /** email me (the owner) for each new order request (default on) */ emailOwner?: boolean;
  /** testing mode: the sheet sends no emails at all */ emailsPaused?: boolean;
  /** how customers can pay; empty means "pay at pickup" */ payment?: PaymentInfo;
  /** town shown on the order form, e.g. "Plainfield" */ town?: string;
  /** private pickup address: emailed only once an order is confirmed AND paid (never shown on the form) */ address?: string;
  /** loyalty: a free half dozen after every `every` picked-up orders (default on, every 5) */ loyalty?: { off?: boolean; every?: number } };
export type PaymentInfo = { cash?: boolean; venmo?: string; cashapp?: string; paypal?: string; zelle?: string; note?: string };
export type PickupUpsert = LedgerEventBase & { type: 'pickup.upsert'; pickup: PickupOption };
export type ShopSettingsEvent = LedgerEventBase & { type: 'shop.settings'; settings: ShopSettings };
export type OrderPacked = LedgerEventBase & { type: 'order.packed'; orderId: string; packed: boolean };
export type OrderHandoff = LedgerEventBase & { type: 'order.handoff'; orderId: string; to: string | null };
/** The picture shown for a recipe on the order form: an uploaded picture, or the drawn illustration. */
export type MenuLook = { recipeId: string; recipeTitle: string; art: import('./components/CookieArt').ArtSpec; photo?: string; illustrationLabel?: boolean; /** short description shown to customers */ blurb?: string };
export type MenuLookEvent = LedgerEventBase & { type: 'menu.look'; look: MenuLook };
/** Removes orders everywhere (e.g. test orders). Their dough reservations and usage disappear with them. */
export type OrderDelete = LedgerEventBase & { type: 'order.delete'; orderIds: string[] };
/** Announcement email to everyone who opted in (sent by the sheet). */
export type NewsSend = LedgerEventBase & { type: 'news.send'; subject: string; body: string; link: string; unsubBase: string };
export type NewsSent = LedgerEventBase & { type: 'news.sent'; sendId: string; count: number; skipped?: number };
export type NewsUnsub = LedgerEventBase & { type: 'news.unsub'; email: string };
/** Private note about a customer (key = email, or name:… when there's no email). */
export type CustomerNote = LedgerEventBase & { type: 'customer.note'; key: string; note: string };
/** A review left from the card's QR code (no order attached). */
export type ReviewEvent = LedgerEventBase & { type: 'review'; name?: string; ratings: Record<string, number>; titles: Record<string, string>; again?: 'yes' | 'maybe' | 'no'; comment?: string };
/** A customer's ratings after pickup (written by the sheet from the feedback page). */
export type FeedbackEvent = LedgerEventBase & { type: 'feedback'; orderId: string; ratings: Record<string, number>; again?: 'yes' | 'maybe' | 'no'; comment?: string };
export type ProductionShared = LedgerEventBase & { type: 'production.record'; record: import('./types').ProductionRecord };
export type ProductionDeleted = LedgerEventBase & { type: 'production.delete'; recordId: string };

/** written by the sheet: the loyalty email went out for this pickup */
export type LoyaltyEarned = LedgerEventBase & { type: 'loyalty.earned'; orderId: string; email: string; count: number };
/** written by the sheet: the private pickup address was emailed for this order */
export type AddressSent = LedgerEventBase & { type: 'order.addressSent'; orderId: string };
export type LedgerEvent = LoyaltyEarned | AddressSent | FreezerAdd | FreezerRemove | ProductUpsert | OrderCreate | OrderUpdate | OrderStatusEvent | OrderPayment
  | PickupUpsert | ShopSettingsEvent | OrderPacked | OrderHandoff | ProductionShared | ProductionDeleted | MenuLookEvent | FeedbackEvent | OrderDelete | NewsSend | NewsSent | NewsUnsub | CustomerNote | ReviewEvent;

export type Batch = { batchId: string; frozenOn: string; added: number; remaining: number; portionWeightG?: number; note?: string; at: string };
export type FreezerItem = { recipeId: string; recipeTitle: string; total: number; batches: Batch[]; oldest?: string };
export type FreezerState = { items: FreezerItem[]; total: number; warnings: string[] };

/** Shared events in sheet order first, then this device's unshared events in time order. */
export function orderEvents<T extends LedgerEventBase>(events: T[]): T[] {
  const shared = events.filter(e => e.seq !== undefined).sort((a, b) => a.seq! - b.seq! || a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId)); // ties (reused numbers): oldest first
  const local = events.filter(e => e.seq === undefined).sort((a, b) => a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId));
  return [...shared, ...local];
}

/** `consumed`: dough used by baked orders (applied after manual events, oldest dough first). */
export function computeFreezer(events: LedgerEvent[], consumed: { recipeId: string; recipeTitle: string; count: number; label: string }[] = []): FreezerState {
  const items = new Map<string, FreezerItem>();
  const warnings: string[] = [];
  const seen = new Set<string>();
  const item = (recipeId: string, recipeTitle: string) => {
    let it = items.get(recipeId);
    if (!it) { it = { recipeId, recipeTitle, total: 0, batches: [] }; items.set(recipeId, it); }
    if (recipeTitle) it.recipeTitle = recipeTitle;
    return it;
  };
  for (const ev of orderEvents(events)) {
    if (seen.has(ev.eventId)) continue; // same event twice never counts twice
    seen.add(ev.eventId);
    if (ev.type === 'freezer.add') {
      if (!(ev.count > 0)) continue;
      const it = item(ev.recipeId, ev.recipeTitle);
      it.batches.push({ batchId: ev.batchId, frozenOn: ev.frozenOn, added: ev.count, remaining: ev.count, portionWeightG: ev.portionWeightG, note: ev.note, at: ev.at });
    } else if (ev.type === 'freezer.remove') {
      if (!(ev.count > 0)) continue;
      const it = item(ev.recipeId, ev.recipeTitle);
      let need = ev.count;
      const fifo = [...it.batches].sort((a, b) => a.frozenOn.localeCompare(b.frozenOn) || a.at.localeCompare(b.at));
      const order = ev.batchId ? [...fifo.filter(b => b.batchId === ev.batchId), ...fifo.filter(b => b.batchId !== ev.batchId)] : fifo;
      for (const b of order) { if (!need) break; const take = Math.min(b.remaining, need); b.remaining -= take; need -= take; }
      if (need > 0) warnings.push(`${it.recipeTitle}: tried to remove ${ev.count} but only ${ev.count - need} were left (the stock can't go below zero).`);
    }
  }
  for (const c of consumed) {
    if (!(c.count > 0)) continue;
    const it = item(c.recipeId, c.recipeTitle);
    let need = c.count;
    for (const b of [...it.batches].sort((a, b) => a.frozenOn.localeCompare(b.frozenOn) || a.at.localeCompare(b.at))) { if (!need) break; const take = Math.min(b.remaining, need); b.remaining -= take; need -= take; }
    if (need > 0) warnings.push(`${it.recipeTitle}: ${c.label} used ${c.count} dough balls but only ${c.count - need} were in the freezer.`);
  }
  const list = [...items.values()].map(it => {
    const batches = it.batches.filter(b => b.remaining > 0).sort((a, b) => a.frozenOn.localeCompare(b.frozenOn));
    return { ...it, batches, total: batches.reduce((s, b) => s + b.remaining, 0), oldest: batches[0]?.frozenOn };
  }).sort((a, b) => a.recipeTitle.localeCompare(b.recipeTitle));
  return { items: list, total: list.reduce((s, i) => s + i.total, 0), warnings };
}

/** Whole weeks since a YYYY-MM-DD date (local). */
export function weeksSince(date: string, now = new Date()): number {
  const d = new Date(date + 'T12:00:00');
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (7 * 86400000)));
}

export const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
