import { describe, expect, it } from 'vitest';
import { findRegistrationInDescription, isDatedUkPlate, parseTypedRegistration } from '../src/shared/registration.ts';

describe('findRegistrationInDescription', () => {
  it('finds a labelled plate', () => {
    expect(findRegistrationInDescription('Lovely car.\nReg: ab12 cde')).toBe('AB12CDE');
    expect(findRegistrationInDescription('REG NO: R123ABC, two owners')).toBe('R123ABC');
  });

  it('finds an unlabelled current-style plate', () => {
    expect(findRegistrationInDescription('Plate LV16 XKN visible in photos')).toBe('LV16XKN');
  });

  it('ignores years, engine sizes and words that only look plate-like', () => {
    expect(findRegistrationInDescription('Registered 2016, Euro 6 compliant')).toBeNull();
    expect(findRegistrationInDescription('reg 2016 car, 1.8 engine')).toBeNull();
    expect(findRegistrationInDescription('')).toBeNull();
  });
});

describe('isDatedUkPlate', () => {
  it.each(['AB12CDE', 'A123BCD', 'ABC123D'])('accepts %s', (plate) => expect(isDatedUkPlate(plate)).toBe(true));
  it.each(['2016CAR', 'MX5', 'ABCDEFG'])('rejects %s', (plate) => expect(isDatedUkPlate(plate)).toBe(false));
});

describe('parseTypedRegistration', () => {
  it('normalises what a person types', () => {
    expect(parseTypedRegistration(' ab12 cde ')).toBe('AB12CDE');
    expect(parseTypedRegistration('1 ABC')).toBe('1ABC'); // dateless plates are fine when typed
  });

  it('rejects text with no digits or the wrong length', () => {
    expect(parseTypedRegistration('HELLO')).toBeNull();
    expect(parseTypedRegistration('AB12CDEFG')).toBeNull();
  });
});
