import { describe, expect, it } from 'vitest';
import { markScreen } from '../src/city/golf/frame';
import { paintPower, powerWords } from '../src/city/golf/parts';

describe('golf controls: the power meter and the reading', () => {
  it('reads the power the way the meter colours it', () => {
    expect(powerWords(42.4)).toMatchObject({ n: 42, zone: 'build', head: '42%' });
    expect(powerWords(42.4).hint).toBe('Keep holding…');
    expect(powerWords(83)).toMatchObject({ n: 83, zone: 'sweet', head: '83% · Sweet!' });
    expect(powerWords(83).hint).toBe('Let go now');
    expect(powerWords(106)).toMatchObject({ zone: 'lunge', head: '106% · Lunge!' });
  });

  it('paints the meter’s fill, zone and number and the reading in the middle', () => {
    const meter = document.createElement('div');
    meter.innerHTML = '<span>0%</span><div></div>';
    const read = document.createElement('div');
    read.innerHTML = '<b></b><span></span>';
    paintPower(meter, read, 88);
    expect(meter.style.getPropertyValue('--power')).toBe(`${(88 / 110) * 100}%`);
    expect(meter.dataset).toMatchObject({ power: '88', zone: 'sweet' });
    expect(meter.firstElementChild!.textContent).toBe('88%');
    expect(read.dataset).toMatchObject({ power: '88', zone: 'sweet' });
    expect(read.textContent).toBe('88% · Sweet!Let go now');
    // Over the top: the lunge, and the fill stops at the meter's top.
    paintPower(meter, null, 110);
    expect(meter.dataset.zone).toBe('lunge');
    expect(meter.style.getPropertyValue('--power')).toBe('100%');
    // Nothing on screen yet: no harm done.
    expect(() => paintPower(null, null, 50)).not.toThrow();
  });
});

describe('golf controls: where the drawing put the ball', () => {
  it('notes on-screen spots as fractions and clears the off-screen ones', () => {
    const c = document.createElement('canvas');
    markScreen(c, 'ball', { x: 0.28125, y: 0.7749 });
    expect(c.dataset.golfBall).toBe('0.281,0.775');
    markScreen(c, 'aim-end', { x: 0.5, y: 0.55 });
    expect(c.getAttribute('data-golf-aim-end')).toBe('0.500,0.550');
    markScreen(c, 'flag', { x: 1.4, y: 0.5 });
    expect(c.dataset.golfFlag).toBe('');
    markScreen(c, 'aim-end', null);
    expect(c.getAttribute('data-golf-aim-end')).toBe('');
  });
});
