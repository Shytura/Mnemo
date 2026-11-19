/**
 * Product barcodes (GTIN): EAN-13 in Europe, UPC-A (12 digits) in North America. Records carry
 * them on the back of the sleeve; catalogues store them as printed, so lookups try both forms.
 */

function gtinCheckDigit(body: string): number {
  let sum = 0;
  // Weights alternate 3, 1, … starting from the digit next to the check digit.
  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** The digits of a valid EAN-13 or UPC-A in any notation, or `undefined`. */
export function normalizeBarcode(input: string): string | undefined {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d{12,13}$/.test(digits)) return undefined;
  return gtinCheckDigit(digits.slice(0, -1)) === Number(digits.at(-1)) ? digits : undefined;
}

/**
 * Both spellings of a code: a UPC-A is the EAN-13 with a leading zero. Catalogues index
 * whichever was printed, so searches try each.
 */
export function barcodeVariants(code: string): string[] {
  const digits = normalizeBarcode(code);
  if (!digits) return [];
  if (digits.length === 12) return [digits, `0${digits}`];
  return digits.startsWith('0') ? [digits, digits.slice(1)] : [digits];
}

/** Whether two codes name the same product, e.g. a UPC-A and its EAN-13 form. */
export function sameBarcode(a: string, b: string): boolean {
  const variants = barcodeVariants(a);
  return variants.length > 0 && barcodeVariants(b).some((v) => variants.includes(v));
}

/**
 * The product code in a scanned barcode, for records and other non-book items. Book codes
 * (978/979) are left to `isbnFromBarcode`.
 */
export function productCodeFromBarcode(raw: string): string | undefined {
  const digits = normalizeBarcode(raw.trim());
  return digits && !/^97[89]\d{10}$/.test(digits) ? digits : undefined;
}
