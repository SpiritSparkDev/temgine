import {
  emptyCouponForm, couponToForm, formToPayload,
  couponValueText, couponMinOrderText, couponUsesText, couponValidityText,
} from '../components/shopCouponUtils';

const coupon = {
  id: 'c1', code: 'SOMMER10', type: 'PERCENT', value: 1000, minOrderCents: 2000, maxUses: 50, usedCount: 3,
  validFrom: '2026-06-01T00:00:00.000Z', validUntil: '2026-08-31T23:59:59.999Z', active: true, note: 'x',
};

describe('shopCouponUtils', () => {
  it('formats display texts', () => {
    expect(couponValueText(coupon)).toBe('10 %');
    expect(couponValueText({ type: 'PERCENT', value: 750 })).toBe('7,5 %');
    expect(couponValueText({ type: 'FIXED', value: 500 })).toBe('5,00 €');
    expect(couponMinOrderText(coupon)).toBe('20,00 €');
    expect(couponMinOrderText({ minOrderCents: null })).toBe('–');
    expect(couponUsesText(coupon)).toBe('3/50');
    expect(couponUsesText({ usedCount: 2, maxUses: null })).toBe('2/∞');
    expect(couponValidityText(coupon)).toBe('01.06.2026 – 31.08.2026');
    expect(couponValidityText({ validFrom: null, validUntil: null })).toBe('unbegrenzt');
    expect(couponValidityText({ validFrom: '2026-06-01T00:00:00.000Z', validUntil: null })).toBe('ab 01.06.2026');
  });

  it('converts percent to bp and sends no code on edit', () => {
    const f = couponToForm(coupon);
    expect(f.value).toBe('10');
    expect(f.validUntil).toBe('2026-08-31');
    f.value = '7,5';
    const { payload, errors } = formToPayload(f);
    expect(errors).toEqual([]);
    expect(payload.code).toBeUndefined();
    expect(payload).toMatchObject({ type: 'PERCENT', value: 750, minOrderCents: 2000, maxUses: 50, active: true });
    expect(payload.validUntil).toBe('2026-08-31T23:59:59.999Z');
  });

  it('converts fixed euro to cents and uppercases a new code', () => {
    const f = { ...emptyCouponForm(), code: ' gruss5 ', type: 'FIXED', value: '5' };
    const { payload, errors } = formToPayload(f);
    expect(errors).toEqual([]);
    expect(payload).toMatchObject({ code: 'GRUSS5', type: 'FIXED', value: 500, minOrderCents: null, maxUses: null, validFrom: null, validUntil: null, note: null });
  });

  it('rejects invalid input', () => {
    const f = { ...emptyCouponForm(), code: 'ab', value: '0', minOrder: 'x', maxUses: '0', validFrom: '2026-02-02', validUntil: '2026-01-01' };
    expect(formToPayload(f).errors.length).toBe(5);
    expect(formToPayload({ ...emptyCouponForm(), code: 'ABC', value: '101' }).errors.length).toBe(1);
    expect(formToPayload({ ...emptyCouponForm(), code: 'ABC', type: 'FIXED', value: '' }).errors.length).toBe(1);
  });
});
