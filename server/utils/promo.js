// Shared promo-code resolution logic — used by /api/promo/validate AND
// order creation, so the discount a customer sees at checkout is exactly
// what gets applied to the order. Discount is always computed on eligible
// LINE ITEMS (a pack counts as one line at its pack price), never on the
// individual products bundled inside a pack.

function resolvePromo(promoCode, items, subtotal) {
  const now = new Date();

  if (!promoCode || !promoCode.isActive) {
    return { valid: false, reason: 'Code promo invalide.' };
  }
  if (promoCode.expiresAt && new Date(promoCode.expiresAt) < now) {
    return { valid: false, reason: 'Ce code promo a expiré.' };
  }
  if (promoCode.usageLimit != null && promoCode.usageCount >= promoCode.usageLimit) {
    return { valid: false, reason: "Ce code promo a atteint sa limite d'utilisation." };
  }
  if (promoCode.minOrderAmount != null && subtotal < promoCode.minOrderAmount) {
    return { valid: false, reason: `Montant minimum requis : ${promoCode.minOrderAmount} MAD.` };
  }

  const hasRestrictions =
    promoCode.eligibleProducts.length > 0 ||
    promoCode.eligiblePacks.length > 0 ||
    promoCode.eligibleCollections.length > 0;

  const eligibleProductIds = new Set(promoCode.eligibleProducts.map((r) => r.productId));
  const eligiblePackIds = new Set(promoCode.eligiblePacks.map((r) => r.packId));
  const eligibleCollectionIds = new Set(promoCode.eligibleCollections.map((r) => r.collectionId));

  function itemMatches(item) {
    if (!hasRestrictions) return item.kind !== 'FREE_PACK'; // global codes cover products & packs
    if (item.kind === 'PRODUCT') {
      return eligibleProductIds.has(item.productId) || eligibleCollectionIds.has(item.collectionId);
    }
    if (item.kind === 'PACK') {
      return eligiblePackIds.has(item.packId) || eligibleCollectionIds.has(item.collectionId);
    }
    return false; // FREE_PACK only matches global (unrestricted) codes
  }

  const eligibleSubtotal = items
    .filter(itemMatches)
    .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  if (eligibleSubtotal <= 0) {
    return { valid: false, reason: 'Ce code ne s\'applique à aucun article de votre panier.' };
  }

  let discount;
  if (promoCode.type === 'PERCENT') {
    discount = eligibleSubtotal * (promoCode.value / 100);
  } else {
    discount = Math.min(promoCode.value, eligibleSubtotal);
  }
  discount = Math.round(discount * 100) / 100;

  return { valid: true, discount, eligibleSubtotal };
}

module.exports = { resolvePromo };
